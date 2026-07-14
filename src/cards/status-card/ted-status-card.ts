import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard } from "custom-card-helpers";

import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { browserModId, resolveDeviceMediaPlayer, resolveDeviceName } from "../../shared/device-id";
import { areaName, resolveDeviceArea } from "../../shared/device-area";
import { resolveMusicPlayer } from "../../shared/music-player";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  REQUIREMENT_LABELS,
  REQUIREMENT_STATUS_VALUES,
  STATUS_CARD_TYPE,
} from "./const";
import type { StatusCardConfig } from "./types";

const REQUIREMENTS_SENSOR = "sensor.teds_requirements";
const SETTINGS_SENSOR = "sensor.teds_settings";

/** The Ted's Cards Backend HACS integration, linked from the backend row's tooltip. */
const BACKEND_REPO_URL = "https://github.com/tedr91/Teds-Cards-Backend";

/** The visual weight of a status row's glyph. */
type StatusLevel = "ok" | "warn" | "bad" | "unknown";

/** A single itemised entry inside a row's tooltip. */
interface DetailItem {
  label: string;
  level: StatusLevel;
}

/** Optional hover/tap tooltip attached to a row. */
interface RowTip {
  title?: string;
  items?: DetailItem[];
  note?: string;
  link?: { label: string; url: string };
}

interface StatusRow {
  icon: string;
  label: string;
  value: string;
  level: StatusLevel;
  /** Optional hover hint on the value (e.g. the full entity id). */
  hint?: string;
  tip?: RowTip;
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
  /** Label of the row whose tooltip is pinned open by tap (hover uses CSS). */
  @state() private _openTip: string | null = null;

  public constructor() {
    super();
    // Keep the effective settings (for the media-player fallback) live.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._onDocClick);
  }

  public disconnectedCallback(): void {
    document.removeEventListener("click", this._onDocClick);
    super.disconnectedCallback();
  }

  /** Close any tap-pinned tooltip when clicking anywhere outside a tip row. */
  private _onDocClick = (): void => {
    if (this._openTip !== null) this._openTip = null;
  };

  private _toggleTip(key: string, ev: Event): void {
    ev.stopPropagation();
    this._openTip = this._openTip === key ? null : key;
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

  /** Ordered ids of every tracked requirement (real status attributes only). */
  private _requirementIds(attrs: Record<string, unknown>): string[] {
    return Object.keys(attrs).filter((k) => REQUIREMENT_STATUS_VALUES.has(attrs[k] as string));
  }

  /** [ok count, total] across every tracked requirement. Only attributes whose
   *  value is an actual requirement status ("ok"/"missing"/"unknown") are counted,
   *  so Home Assistant's auto-added attributes (friendly_name, icon, …) and the
   *  sensor's own meta keys are ignored. */
  private _requirementTotals(attrs: Record<string, unknown>): [number, number] {
    const ids = this._requirementIds(attrs);
    const ok = ids.filter((id) => attrs[id] === "ok").length;
    return [ok, ids.length];
  }

  /** Itemised tooltip entries for the given requirement ids. */
  private _detailItems(attrs: Record<string, unknown>, ids: readonly string[]): DetailItem[] {
    return ids.map((id) => ({
      label: REQUIREMENT_LABELS[id] ?? id,
      level: TedStatusCard._levelOf(attrs[id]),
    }));
  }

  /** True when Browser Mod has registered a device for this browser id. */
  private _browserRegistered(id: string): boolean {
    const devices = (this.hass as RegistryHass | undefined)?.devices;
    if (!devices) return false;
    return Object.values(devices).some((d) =>
      d?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === id),
    );
  }

  /** The player that alarms/timers/notifications fall back to on this device
   *  (effective system-sound setting → device default). */
  private _effectiveMediaPlayer(): string | undefined {
    const set = settingsStore.get("system_sound_player");
    if (typeof set === "string" && set) return set;
    return resolveDeviceMediaPlayer(this.hass);
  }

  /** The first `weather.*` entity (what the requirements check detects). */
  private _firstWeatherEntity(): string | undefined {
    const states = this.hass?.states;
    return states ? Object.keys(states).find((id) => id.startsWith("weather.")) : undefined;
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

    // Current device's registered name + id (Ted's Cards registration → Browser Mod device name).
    const devName =
      settingsStore.registry()[settingsStore.deviceId]?.name || resolveDeviceName(this.hass);
    rows.push({
      icon: "mdi:devices",
      label: "Device Name",
      value: devName || "(unnamed)",
      hint: settingsStore.deviceId,
      level: devName ? "ok" : "warn",
    });

    // Current device's resolved area.
    const areaRes = resolveDeviceArea(this.hass);
    const areaLabel = areaName(this.hass, areaRes.area) ?? areaRes.area;
    const areaSrc =
      areaRes.source === "browser_mod"
        ? " · Browser Mod"
        : areaRes.source === "local"
          ? " · saved on device"
          : areaRes.source === "config"
            ? " · card"
            : "";
    rows.push({
      icon: "mdi:map-marker",
      label: "Device Area",
      value: areaRes.area ? `${areaLabel}${areaSrc}` : "none set",
      hint: areaRes.area,
      level: areaRes.area ? "ok" : "warn",
    });

    // Ted's Backend connection + version (top of the list — it's the funnel that
    // powers every other check).
    const settings = this.hass?.states?.[SETTINGS_SENSOR];
    const connected = !!settings && settings.state !== "unavailable" && settings.state !== "unknown";
    const version = typeof attrs?.version === "string" ? (attrs.version as string) : undefined;
    rows.push({
      icon: "mdi:server-network",
      label: "Ted's Cards Backend",
      value: connected ? (version ? `Connected · v${version}` : "Connected") : "Not installed",
      level: connected ? "ok" : "bad",
      tip: {
        title: "Ted's Cards Backend",
        note: connected
          ? "The integration powering alarms, timers, notifications and per-device settings."
          : "Install the Ted's Cards Backend integration via HACS to enable alarms, timers, notifications and settings.",
        link: { label: "Ted's Cards Backend on GitHub", url: BACKEND_REPO_URL },
      },
    });

    // Requirements + integrations (need the backend's requirements sensor).
    if (attrs) {
      const reqIds = this._requirementIds(attrs);
      const [rok, rtotal] = this._requirementTotals(attrs);
      rows.push({
        icon: "mdi:clipboard-check-outline",
        label: "Requirements",
        value: `${rok} of ${rtotal} met`,
        level: rtotal > 0 && rok === rtotal ? "ok" : "warn",
        tip: { title: "Requirements", items: this._detailItems(attrs, reqIds) },
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

    // Weather entity.
    if (attrs) {
      const weatherOk = attrs.weather === "ok";
      const weatherId = weatherOk ? this._firstWeatherEntity() : undefined;
      rows.push({
        icon: "mdi:weather-partly-cloudy",
        label: "Weather",
        value: weatherOk
          ? weatherId
            ? `Available · ${this._entityLabel(weatherId)}`
            : "Available"
          : "None found",
        hint: weatherId,
        level: weatherOk ? "ok" : "warn",
      });
    }

    // System-sound player (alarms/timers/notifications playback target).
    const mp = this._effectiveMediaPlayer();
    rows.push({
      icon: "mdi:speaker",
      label: "System Sounds Player",
      value: mp ? `Available · ${this._entityLabel(mp)}` : "none detected",
      hint: mp,
      level: mp ? "ok" : "warn",
    });

    // Music & media player (the Music view target — the auto-matched MA player).
    const music = resolveMusicPlayer(this.hass);
    rows.push({
      icon: "mdi:music",
      label: "Music and Media Player",
      value:
        music.state === "ok"
          ? `${music.matched ? "Auto-matched" : "Available"} · ${this._entityLabel(music.entity)}`
          : music.state === "unmatched"
            ? "No Music Assistant player"
            : "none detected",
      hint:
        music.state === "ok" ? music.entity : music.state === "unmatched" ? music.base : undefined,
      level: music.state === "ok" ? "ok" : "warn",
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

  /** Map a requirement attribute value to a status level. */
  private static _levelOf(state: unknown): StatusLevel {
    return state === "ok" ? "ok" : state === "missing" ? "bad" : "unknown";
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;
    const themeClass = tedCardThemeClass(cfg.theme ?? "ha");

    return html`
      <div class="sc-box ${themeClass}" role="status" aria-live="polite">
        ${cfg.title ? html`<div class="sc-title">${cfg.title}</div>` : nothing}
        <div class="sc-rows">
          ${this._rows().map((r) => this._renderRow(r))}
        </div>
      </div>
    `;
  }

  private _renderRow(r: StatusRow): TemplateResult {
    if (!r.tip) {
      return html`
        <div class="sc-row sc-lvl-${r.level}">
          <ha-icon class="sc-row-icon" .icon=${r.icon}></ha-icon>
          <span class="sc-label">${r.label}</span>
          <span class="sc-value" title=${r.hint ?? nothing}>${r.value}</span>
          <ha-icon class="sc-status" .icon=${TedStatusCard._glyph(r.level)}></ha-icon>
        </div>
      `;
    }
    const open = this._openTip === r.label;
    return html`
      <div
        class="sc-row sc-row--tip sc-lvl-${r.level} ${open ? "is-open" : ""}"
        tabindex="0"
        role="button"
        aria-haspopup="true"
        aria-expanded=${open ? "true" : "false"}
        @click=${(e: Event) => this._toggleTip(r.label, e)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") this._toggleTip(r.label, e);
          if (e.key === "Escape") this._openTip = null;
        }}
      >
        <ha-icon class="sc-row-icon" .icon=${r.icon}></ha-icon>
        <span class="sc-label">${r.label}<ha-icon class="sc-info" .icon=${"mdi:information-outline"}></ha-icon></span>
        <span class="sc-value" title=${r.hint ?? nothing}>${r.value}</span>
        <ha-icon class="sc-status" .icon=${TedStatusCard._glyph(r.level)}></ha-icon>
        ${this._renderTip(r.tip)}
      </div>
    `;
  }

  private _renderTip(tip: RowTip): TemplateResult {
    return html`
      <div class="sc-tip" role="tooltip" @click=${(e: Event) => e.stopPropagation()}>
        ${tip.title ? html`<div class="sc-tip-title">${tip.title}</div>` : nothing}
        ${tip.items?.length
          ? html`<div class="sc-tip-items">
              ${tip.items.map(
                (it) => html`<div class="sc-tip-item sc-lvl-${it.level}">
                  <span>${it.label}</span>
                  <ha-icon .icon=${TedStatusCard._glyph(it.level)}></ha-icon>
                </div>`,
              )}
            </div>`
          : nothing}
        ${tip.note ? html`<div class="sc-tip-note">${tip.note}</div>` : nothing}
        ${tip.link
          ? html`<a class="sc-tip-link" href=${tip.link.url} target="_blank" rel="noopener noreferrer"
              >${tip.link.label} ›</a
            >`
          : nothing}
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
        display: flex;
        align-items: center;
      }
      .sc-label {
        display: inline-flex;
        align-items: center;
        font-weight: 600;
        font-size: 0.95em;
        line-height: 1;
      }
      .sc-value {
        font-size: 0.9em;
        line-height: 1;
        opacity: 0.9;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sc-status {
        --mdc-icon-size: 20px;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
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

      /* --- Tooltip rows --------------------------------------------------- */
      .sc-row--tip {
        position: relative;
        cursor: help;
        outline: none;
      }
      .sc-info {
        --mdc-icon-size: 15px;
        margin-left: 5px;
        opacity: 0.5;
      }
      .sc-row--tip:hover .sc-info,
      .sc-row--tip:focus-visible .sc-info,
      .sc-row--tip.is-open .sc-info {
        opacity: 0.9;
      }
      .sc-row--tip:focus-visible {
        border-radius: var(--ted-style-radius-sm);
        box-shadow: 0 0 0 2px var(--ted-style-accent, #4cc2ff);
      }

      .sc-tip {
        position: absolute;
        z-index: 30;
        top: calc(100% - 2px);
        right: 0;
        min-width: 220px;
        max-width: min(360px, 90vw);
        padding: 10px 12px;
        border-radius: var(--ted-style-radius-sm);
        background: rgba(20, 22, 30, 0.96);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(18px) saturate(150%);
        -webkit-backdrop-filter: blur(18px) saturate(150%);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
        pointer-events: none;
      }
      .sc-box.ted-card--theme-ha .sc-tip {
        background: var(--ha-card-background, var(--card-background-color, #fff));
        color: var(--primary-text-color, #1c1c1c);
        border-color: var(--divider-color, rgba(120, 120, 120, 0.3));
      }
      .sc-row--tip:hover .sc-tip,
      .sc-row--tip:focus-within .sc-tip,
      .sc-row--tip.is-open .sc-tip {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        pointer-events: auto;
      }

      .sc-tip-title {
        font-weight: 600;
        font-size: 0.9em;
        margin-bottom: 8px;
        opacity: 0.85;
      }
      .sc-tip-items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .sc-tip-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.9em;
      }
      .sc-tip-item ha-icon {
        --mdc-icon-size: 18px;
        flex: 0 0 auto;
      }
      .sc-tip-item.sc-lvl-ok ha-icon {
        color: var(--ted-style-success, #6ccb5f);
      }
      .sc-tip-item.sc-lvl-warn ha-icon {
        color: var(--ted-style-warning, #ffb454);
      }
      .sc-tip-item.sc-lvl-bad ha-icon {
        color: var(--ted-style-danger, #ff99a4);
      }
      .sc-tip-item.sc-lvl-unknown ha-icon {
        color: var(--ted-style-muted, rgba(255, 255, 255, 0.6));
      }
      .sc-tip-note {
        font-size: 0.88em;
        line-height: 1.4;
        opacity: 0.9;
      }
      .sc-tip-link {
        display: inline-block;
        margin-top: 8px;
        font-size: 0.88em;
        font-weight: 600;
        color: var(--ted-style-accent, #4cc2ff);
        text-decoration: none;
      }
      .sc-tip-link:hover {
        text-decoration: underline;
      }
    `,
  ];
}
