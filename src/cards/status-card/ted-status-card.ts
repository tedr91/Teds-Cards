import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard } from "custom-card-helpers";

import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { browserModId, resolveDeviceMediaPlayer } from "../../shared/device-id";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  INTEGRATION_REQUIREMENTS,
  REQUIREMENT_META_KEYS,
  STATUS_CARD_TYPE,
} from "./const";
import type { StatusCardConfig } from "./types";

const REQUIREMENTS_SENSOR = "sensor.teds_requirements";
const SETTINGS_SENSOR = "sensor.teds_settings";

/** The visual weight of a status row's glyph. */
type StatusLevel = "ok" | "warn" | "bad" | "unknown";

interface StatusRow {
  icon: string;
  label: string;
  value: string;
  level: StatusLevel;
}

/** Minimal shape of the HA device registry present on `hass` at runtime. */
interface RegistryHass {
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
}

/**
 * A read-only, at-a-glance panel summarising this device's readiness: how many
 * dependencies and integrations are satisfied, whether Browser Mod has registered
 * *this* browser (and its id), the backend connection + version, the weather
 * entity, and the media player playback falls back to.
 *
 * The Browser Mod row reports the *current* browser's id, which only exists in
 * the browser (`window.browser_mod.browserID`) — the same source Browser Mod's
 * own panel reads — so this is a client-side card. It is intentionally NOT
 * registered with the "Add card" picker (`registerCustomCard` is not called), so
 * it is used only by reference in YAML (`type: custom:ted-status-card`).
 */
@customElement(STATUS_CARD_TYPE)
export class TedStatusCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: StatusCardConfig;

  public constructor() {
    super();
    // Keep the effective settings (for the media-player fallback) live.
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: StatusCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 4;
  }

  // --- Data helpers ----------------------------------------------------------

  /** Attributes of sensor.teds_requirements, or undefined when the backend is absent. */
  private _reqAttrs(): Record<string, unknown> | undefined {
    return this.hass?.states?.[REQUIREMENTS_SENSOR]?.attributes;
  }

  /** [ok count, total] across every tracked requirement (excludes meta keys). */
  private _requirementTotals(attrs: Record<string, unknown>): [number, number] {
    const ids = Object.keys(attrs).filter((k) => !REQUIREMENT_META_KEYS.has(k));
    const ok = ids.filter((id) => attrs[id] === "ok").length;
    return [ok, ids.length];
  }

  /** [ok count, total] across just the integration requirements. */
  private _integrationTotals(attrs: Record<string, unknown>): [number, number] {
    const present = INTEGRATION_REQUIREMENTS.filter((id) => id in attrs);
    const ok = present.filter((id) => attrs[id] === "ok").length;
    return [ok, present.length];
  }

  /** True when Browser Mod has registered a device for this browser id. */
  private _browserRegistered(id: string): boolean {
    const devices = (this.hass as RegistryHass | undefined)?.devices;
    if (!devices) return false;
    return Object.values(devices).some((d) =>
      d?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === id),
    );
  }

  /** The media player playback falls back to on this device (effective setting → device default). */
  private _effectiveMediaPlayer(): string | undefined {
    const set = settingsStore.get("media_player");
    if (typeof set === "string" && set) return set;
    return resolveDeviceMediaPlayer(this.hass);
  }

  private _entityLabel(entityId?: string): string {
    if (!entityId) return "none detected";
    const fn = this.hass?.states?.[entityId]?.attributes?.friendly_name;
    return typeof fn === "string" && fn ? fn : entityId;
  }

  // --- Rows ------------------------------------------------------------------

  private _rows(): StatusRow[] {
    const rows: StatusRow[] = [];
    const attrs = this._reqAttrs();

    // Requirements + integrations (need the backend's requirements sensor).
    if (attrs) {
      const [rok, rtotal] = this._requirementTotals(attrs);
      rows.push({
        icon: "mdi:clipboard-check-outline",
        label: "Requirements",
        value: `${rok} of ${rtotal} met`,
        level: rtotal > 0 && rok === rtotal ? "ok" : "warn",
      });

      const [iok, itotal] = this._integrationTotals(attrs);
      rows.push({
        icon: "mdi:puzzle-outline",
        label: "Integrations",
        value: `${iok} of ${itotal} installed`,
        level: itotal > 0 && iok === itotal ? "ok" : "warn",
      });
    } else {
      rows.push({
        icon: "mdi:clipboard-check-outline",
        label: "Requirements",
        value: "backend not detected",
        level: "unknown",
      });
    }

    // Browser Mod registration + this browser's id.
    const bmInstalled = attrs?.browser_mod === "ok";
    const bid = browserModId();
    if (bmInstalled && bid && this._browserRegistered(bid)) {
      rows.push({ icon: "mdi:web", label: "Browser Mod", value: `Registered · ${bid}`, level: "ok" });
    } else if (bmInstalled && bid) {
      rows.push({ icon: "mdi:web", label: "Browser Mod", value: `Not registered · ${bid}`, level: "warn" });
    } else if (bmInstalled) {
      rows.push({ icon: "mdi:web", label: "Browser Mod", value: "Installed, no browser id", level: "warn" });
    } else {
      rows.push({ icon: "mdi:web", label: "Browser Mod", value: "Not installed", level: "warn" });
    }

    // Backend connection + version.
    const settings = this.hass?.states?.[SETTINGS_SENSOR];
    const connected = !!settings && settings.state !== "unavailable" && settings.state !== "unknown";
    const version = typeof attrs?.version === "string" ? (attrs.version as string) : undefined;
    rows.push({
      icon: "mdi:server-network",
      label: "Backend",
      value: connected ? (version ? `Connected · v${version}` : "Connected") : "Not installed",
      level: connected ? "ok" : "bad",
    });

    // Weather entity.
    if (attrs) {
      const weatherOk = attrs.weather === "ok";
      rows.push({
        icon: "mdi:weather-partly-cloudy",
        label: "Weather",
        value: weatherOk ? "Available" : "None found",
        level: weatherOk ? "ok" : "warn",
      });
    }

    // Media player playback target.
    const mp = this._effectiveMediaPlayer();
    rows.push({
      icon: "mdi:speaker",
      label: "Media Player",
      value: mp ? this._entityLabel(mp) : "none detected",
      level: mp ? "ok" : "warn",
    });

    return rows;
  }

  // --- Render ----------------------------------------------------------------

  private static _glyph(level: StatusLevel): string {
    switch (level) {
      case "ok":
        return "mdi:check-circle";
      case "warn":
        return "mdi:alert-circle";
      case "bad":
        return "mdi:close-octagon";
      default:
        return "mdi:help-circle";
    }
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;
    const themeClass = tedCardThemeClass(cfg.theme ?? "ha");

    return html`
      <div class="sc-box ${themeClass}" role="status" aria-live="polite">
        ${cfg.title ? html`<div class="sc-title">${cfg.title}</div>` : nothing}
        <div class="sc-rows">
          ${this._rows().map(
            (r) => html`
              <div class="sc-row sc-lvl-${r.level}">
                <ha-icon class="sc-row-icon" .icon=${r.icon}></ha-icon>
                <span class="sc-label">${r.label}</span>
                <span class="sc-value">${r.value}</span>
                <ha-icon class="sc-status" .icon=${TedStatusCard._glyph(r.level)}></ha-icon>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
      }

      .sc-box {
        box-sizing: border-box;
        padding: 14px 16px;
        border-radius: var(--ted-style-radius);
        color: var(--ted-style-text, #fff);
        background: rgba(28, 32, 44, 0.62);
        backdrop-filter: blur(22px) saturate(150%);
        -webkit-backdrop-filter: blur(22px) saturate(150%);
        border: 1px solid rgba(255, 255, 255, 0.22);
        font-family: inherit;
      }
      .sc-box.ted-card--theme-ha {
        color: var(--primary-text-color, #1c1c1c);
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border: 1px solid var(--divider-color, rgba(120, 120, 120, 0.22));
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
      }

      .sc-title {
        font-size: 1.1em;
        font-weight: 600;
        letter-spacing: 0.01em;
        margin-bottom: 10px;
      }

      .sc-rows {
        display: flex;
        flex-direction: column;
      }
      .sc-row {
        display: grid;
        grid-template-columns: auto auto 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 8px 2px;
        border-top: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.09));
      }
      .sc-row:first-child {
        border-top: none;
      }
      .sc-row-icon {
        --mdc-icon-size: 20px;
        color: var(--ted-style-icon-dim, rgba(255, 255, 255, 0.7));
      }
      .sc-label {
        font-weight: 600;
        font-size: 0.95em;
      }
      .sc-value {
        font-size: 0.9em;
        opacity: 0.9;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sc-status {
        --mdc-icon-size: 20px;
        flex: 0 0 auto;
      }

      .sc-lvl-ok .sc-status {
        color: var(--ted-style-success, #6ccb5f);
      }
      .sc-lvl-warn .sc-status {
        color: var(--ted-style-warning, #ffb454);
      }
      .sc-lvl-bad .sc-status {
        color: var(--ted-style-danger, #ff99a4);
      }
      .sc-lvl-unknown .sc-status {
        color: var(--ted-style-muted, rgba(255, 255, 255, 0.6));
      }
    `,
  ];
}
