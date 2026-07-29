import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard } from "custom-card-helpers";

import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { browserModId, browserModDeviceId, isDeviceRegistered, registerBrowserMod, resolveDeviceMediaPlayer, resolveDeviceName } from "../../shared/device-id";
import { areaName, resolveDeviceArea } from "../../shared/device-area";
import { themedIcon } from "../../shared/icons";
import { resolveMusicPlayer, warmMassProviders, isMassIntegrationLoaded } from "../../shared/music-player";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  REQUIREMENT_LABELS,
  REQUIREMENT_STATUS_VALUES,
  STATUS_CARD_TYPE,
} from "./const";
import type { StatusCardConfig } from "./types";

const REQUIREMENTS_SENSOR = "sensor.teds_requirements";
const SETTINGS_SENSOR = "sensor.teds_settings";

/** The Ted's Dashboard System HACS integration, linked from the backend row's tooltip. */
const BACKEND_REPO_URL = "https://github.com/tedr91/Teds-Dashboard-System";

/** Status level → semantic glyph key (resolved via the configured icon set). */
const GLYPH_KEYS = {
  ok: "check-circle",
  warn: "alert-circle",
  bad: "error-circle",
  unknown: "help-circle",
} as const;

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
  /** Optional action button rendered inside the popup. */
  action?: { label: string; icon?: string; onClick: () => void };
}

interface StatusRow {
  icon: string;
  label: string;
  value: string;
  level: StatusLevel;
  /** Optional hover hint on the value (e.g. the full entity id). */
  hint?: string;
  tip?: RowTip;
  /** Optional inline action button (e.g. "Create player"). */
  action?: { label: string; onClick: () => void };
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
  /** True while the "Create MA player" request is in flight. */
  @state() private _maBusy = false;

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

  protected updated(): void {
    // Warm the exact Music Assistant provider cache so the Music player row ranks
    // same-area players correctly (Sonos → Chromecast → AirPlay → DLNA).
    if (this.hass) void warmMassProviders(this.hass).then((c) => c && this.requestUpdate());
  }

  /** Close any tap-pinned tooltip when clicking anywhere outside a tip row. */
  private _onDocClick = (): void => {
    if (this._openTip !== null) this._openTip = null;
  };

  private _toggleTip(key: string, ev: Event): void {
    ev.stopPropagation();
    this._openTip = this._openTip === key ? null : key;
  }

  /** Ask the backend to auto-create a Music Assistant player for this device's speaker. */
  private async _createMaPlayer(entityId: string): Promise<void> {
    if (!this.hass || this._maBusy) return;
    this._maBusy = true;
    try {
      await this.hass.callWS({
        type: "teds_dashboard_system/create_ma_player",
        entity_id: entityId,
      });
      settingsStore.setValue("device", "music_autoexpose_state", "done");
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message || "Couldn't create the player.";
      if (code === "needs_admin_token") {
        settingsStore.setValue("device", "music_autoexpose_state", "needs_token");
        this._notify(
          "warning",
          "Set up music on this device",
          "Music Assistant only lets an admin add players. To make this device a Music " +
            "Assistant speaker automatically, paste a Music Assistant admin token in " +
            "Settings → Devices & Services → Ted's Dashboard System → Configure. Or add it " +
            "yourself in Music Assistant → Settings → Providers → Home Assistant Players.",
        );
      } else if (code === "needs_hass_setup") {
        settingsStore.setValue("device", "music_autoexpose_state", "needs_token");
        this._notify("warning", "Set up music on this device", message);
      } else {
        settingsStore.setValue("device", "music_autoexpose_state", "failed");
        this._notify("danger", "Music setup didn't finish", message);
      }
    } finally {
      this._maBusy = false;
      this.requestUpdate();
    }
  }

  /** Post a persistent, reviewable notification via the Ted notification engine. */
  private _notify(
    severity: "info" | "success" | "warning" | "danger" | "tip",
    title: string,
    message: string,
  ): void {
    const area = (
      settingsStore.registry()[settingsStore.deviceId] as { area?: string } | undefined
    )?.area;
    const data: Record<string, unknown> = { title, message, severity, persistence: "normal" };
    if (area) data.area = area;
    void this.hass?.callService?.("teds_dashboard_system", "notify", data);
  }

  /** Navigate the Home Assistant UI to a panel/config path. */
  private _navigate(path: string): void {
    this._openTip = null;
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  /** Register this browser with Browser Mod directly (no navigation); falls back
   *  to opening the Browser Mod panel if a direct register isn't possible. */
  private _registerDevice(): void {
    this._openTip = null;
    if (registerBrowserMod(this.hass)) {
      this._notify(
        "success",
        "Registering this device",
        "This device is being registered with Browser Mod. It may take a moment to " +
          "appear with a name and area \u2014 then you can rename it or set its area.",
      );
      // Nudge a re-render so the row flips to "Registered" once the device lands.
      window.setTimeout(() => this.requestUpdate(), 1500);
    } else {
      this._navigate("/browser-mod");
    }
  }

  /** Open this device's page (rename + area) — falls back to the integration. */
  private _openDeviceSettings(): void {
    const id = browserModDeviceId(this.hass);
    this._navigate(id ? `/config/devices/device/${id}` : "/config/integrations/integration/browser_mod");
  }

  /** Popup for the Device Name/Area + Browser Mod rows: register when this browser
   *  isn't set up yet, otherwise jump to its name/area settings. */
  private _deviceRowTip(): RowTip {
    if (!isDeviceRegistered(this.hass)) {
      return {
        title: "Device not registered",
        note:
          "This browser isn't registered with Browser Mod, so it has no name or area. " +
          "Register it to unlock per-device settings, area-scoped alarms and notifications, " +
          "and the right home layout.",
        action: {
          label: "Register this device with Browser Mod",
          icon: "mdi:web",
          onClick: () => this._registerDevice(),
        },
      };
    }
    // Renaming a device / changing its area happens in Settings → Devices, which is
    // admin-only — so offer the action to admins and explain the limitation to others.
    if (!this.hass?.user?.is_admin) {
      return {
        title: "Device name & area",
        note: "Renaming this device or changing its area can only be done by an administrator.",
      };
    }
    return {
      title: "Device name & area",
      note: "Rename this device or change its area in Home Assistant.",
      action: {
        label: "Update Name / Area",
        icon: "mdi:pencil-outline",
        onClick: () => this._openDeviceSettings(),
      },
    };
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

    // Logged-in Home Assistant user.
    const userName = this.hass?.user?.name;
    rows.push({
      icon: themedIcon("account"),
      label: "User Name",
      value: userName || "unknown",
      level: userName ? "ok" : "warn",
    });

    // Current device's registered name + resolved area (combined into one row).
    const devName =
      settingsStore.registry()[settingsStore.deviceId]?.name || resolveDeviceName(this.hass);
    const areaRes = resolveDeviceArea(this.hass);
    const areaLabel = areaName(this.hass, areaRes.area) ?? areaRes.area;
    // Where the area was resolved from — surfaced on hover instead of inline.
    const areaSrcLabel =
      areaRes.source === "browser_mod"
        ? "Browser Mod"
        : areaRes.source === "local"
          ? "saved on device"
          : areaRes.source === "config"
            ? "card config"
            : undefined;
    const devAreaHint = [
      settingsStore.deviceId,
      areaRes.area && areaSrcLabel ? `area from ${areaSrcLabel}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
    rows.push({
      icon: themedIcon("device"),
      label: "Device Name / Area",
      value: `${devName || "(unnamed)"} / ${areaRes.area ? areaLabel : "no area"}`,
      hint: devAreaHint,
      level: devName && areaRes.area ? "ok" : "warn",
      tip: this._deviceRowTip(),
    });

    // Ted's Backend connection + version (top of the list — it's the funnel that
    // powers every other check).
    const settings = this.hass?.states?.[SETTINGS_SENSOR];
    const connected = !!settings && settings.state !== "unavailable" && settings.state !== "unknown";
    const version = typeof attrs?.version === "string" ? (attrs.version as string) : undefined;
    rows.push({
      icon: themedIcon("server"),
      label: "Ted's Dashboard System",
      value: connected ? (version ? `Connected · v${version}` : "Connected") : "Not installed",
      level: connected ? "ok" : "bad",
      tip: {
        title: "Ted's Dashboard System",
        note: connected
          ? "The integration powering alarms, timers, notifications and per-device settings."
          : "Install the Ted's Dashboard System integration via HACS to enable alarms, timers, notifications and settings.",
        link: { label: "Ted's Dashboard System on GitHub", url: BACKEND_REPO_URL },
      },
    });

    // Browser Mod registration + this browser's id (paired with the integration row).
    const bmInstalled = attrs?.browser_mod === "ok";
    const bid = browserModId();
    const webIcon = themedIcon("web");
    if (bmInstalled && bid && this._browserRegistered(bid)) {
      rows.push({ icon: webIcon, label: "Browser Mod", value: `Registered · ${bid}`, level: "ok", tip: this._deviceRowTip() });
    } else if (bmInstalled && bid) {
      rows.push({ icon: webIcon, label: "Browser Mod", value: `Not registered · ${bid}`, level: "warn", tip: this._deviceRowTip() });
    } else if (bmInstalled) {
      rows.push({ icon: webIcon, label: "Browser Mod", value: "Installed, no browser id", level: "warn" });
    } else if (attrs?.browser_mod === "setup") {
      rows.push({ icon: webIcon, label: "Browser Mod", value: "Downloaded — add integration", level: "warn" });
    } else {
      rows.push({ icon: webIcon, label: "Browser Mod", value: "Not installed", level: "warn" });
    }

    // Requirements + integrations (need the backend's requirements sensor).
    if (attrs) {
      const reqIds = this._requirementIds(attrs);
      const [rok, rtotal] = this._requirementTotals(attrs);
      rows.push({
        icon: themedIcon("requirements"),
        label: "Requirements",
        value: `${rok} of ${rtotal} met`,
        level: rtotal > 0 && rok === rtotal ? "ok" : "warn",
        tip: { title: "Requirements", items: this._detailItems(attrs, reqIds) },
      });
    } else {
      rows.push({
        icon: themedIcon("requirements"),
        label: "Requirements",
        value: "backend not detected",
        level: "unknown",
      });
    }

    // Weather entity.
    if (attrs) {
      const weatherOk = attrs.weather === "ok";
      const weatherId = weatherOk ? this._firstWeatherEntity() : undefined;
      rows.push({
        icon: themedIcon("weather"),
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
      icon: themedIcon("speaker"),
      label: "System Sounds Player",
      value: mp ? `Available · ${this._entityLabel(mp)}` : "none detected",
      hint: mp,
      level: mp ? "ok" : "warn",
    });

    // Music & media player (the Music view target — the auto-matched MA player).
    const music = resolveMusicPlayer(this.hass);
    const maLoaded = isMassIntegrationLoaded(this.hass);
    if (music.state === "ok") {
      // A device's own MA player is only "available" while that browser is open, so an
      // unavailable state is the normal resting state — show it neutrally, not as an error.
      const st = this.hass?.states?.[music.entity]?.state;
      const offline = st === "unavailable" || st === "unknown" || st === undefined;
      rows.push({
        icon: themedIcon("music"),
        label: "Music and Media Player",
        value: offline
          ? `Offline / sleeping · ${this._entityLabel(music.entity)}`
          : `${music.matched ? "Auto-matched" : "Available"} · ${this._entityLabel(music.entity)}`,
        hint: music.entity,
        level: offline ? "unknown" : "ok",
      });
    } else if (!maLoaded) {
      // The MA app can be running, but without the HA integration no MA players are
      // exposed as entities — point the user at installing the integration.
      rows.push({
        icon: themedIcon("music"),
        label: "Music and Media Player",
        value: "Music Assistant integration not set up",
        level: "warn",
        tip: {
          title: "Music Assistant integration",
          note:
            "The Music Assistant app/server can be running, but the Home Assistant " +
            "integration is what exposes MA players as media_player entities. Without it, " +
            "the Music view has no player to use. Add it under Settings → Devices & Services.",
          link: {
            label: "Add the integration",
            url: "https://my.home-assistant.io/redirect/config_flow_start?domain=music_assistant",
          },
        },
      });
    } else {
      // Integration present but nothing matched this device yet. Reflect any in-progress
      // auto-setup (proactive or manual), then offer a manual enable / retry.
      const autoState = settingsStore.deviceSettings().music_autoexpose_state;
      if (this._maBusy || autoState === "pending") {
        rows.push({
          icon: themedIcon("music"),
          label: "Music and Media Player",
          value: "Initializing… please wait",
          level: "unknown",
        });
      } else {
        // Only an admin can add an MA player (it writes Music Assistant's config), so
        // offer the enable/retry action to admins and explain the limit to everyone else.
        const admin = !!this.hass?.user?.is_admin;
        const failed = admin && autoState === "failed";
        const needsSetup = admin && autoState === "needs_token";
        const unmatched = music.state === "unmatched";
        rows.push({
          icon: themedIcon("music"),
          label: "Music and Media Player",
          value: failed
            ? "Music setup didn't finish"
            : needsSetup
              ? "Music Assistant setup needed"
              : unmatched
                ? "No Music Assistant player"
                : "none detected",
          hint: unmatched ? music.base : undefined,
          level: failed ? "bad" : "warn",
          action:
            admin && unmatched
              ? {
                  label: failed || needsSetup ? "Try again" : "Enable music on this device",
                  onClick: () => void this._createMaPlayer(music.base),
                }
              : undefined,
          tip:
            !admin && unmatched
              ? {
                  title: "Music and Media Player",
                  note:
                    "Enabling music on this device adds it as a Music Assistant player, which " +
                    "changes Music Assistant's configuration — only an administrator can do that. " +
                    "Ask an admin to enable it, or add this device's player in Music Assistant → " +
                    "Settings → Providers → Home Assistant Players.",
                }
              : undefined,
        });
      }
    }

    return rows;
  }

  // --- Render ----------------------------------------------------------------

  private static _glyph(level: StatusLevel): string {
    return themedIcon(GLYPH_KEYS[level]);
  }

  /** Map a requirement attribute value to a status level. */
  private static _levelOf(state: unknown): StatusLevel {
    return state === "ok"
      ? "ok"
      : state === "setup"
        ? "warn"
        : state === "missing"
          ? "bad"
          : "unknown";
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
          <div class="sc-right">
            ${r.action
              ? html`<button
                  class="sc-action"
                  ?disabled=${this._maBusy}
                  title="Set this device up as a Music Assistant player"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    r.action?.onClick();
                  }}
                >
                  ${this._maBusy ? "Setting up…" : r.action.label}
                </button>`
              : nothing}
            <ha-icon class="sc-status" .icon=${TedStatusCard._glyph(r.level)}></ha-icon>
          </div>
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
        ${tip.action
          ? html`<button
              class="sc-tip-action"
              @click=${(e: Event) => {
                e.stopPropagation();
                tip.action?.onClick();
              }}
            >
              ${tip.action.icon ? html`<ha-icon .icon=${tip.action.icon}></ha-icon>` : nothing}
              <span>${tip.action.label}</span>
            </button>`
          : nothing}
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
      .sc-right {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        min-width: 0;
      }
      .sc-action {
        flex: 0 0 auto;
        font: inherit;
        font-size: 0.82em;
        line-height: 1;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.28));
        background: var(--ted-style-accent, var(--primary-color, #3b82f6));
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
      }
      .sc-action:disabled {
        opacity: 0.6;
        cursor: default;
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
      .sc-tip-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        font: inherit;
        font-size: 0.86em;
        font-weight: 600;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.28));
        background: var(--ted-style-accent, var(--primary-color, #3b82f6));
        color: #fff;
        cursor: pointer;
        white-space: nowrap;
      }
      .sc-tip-action ha-icon {
        --mdc-icon-size: 18px;
      }
      .sc-tip-action:hover {
        filter: brightness(1.08);
      }
    `,
  ];
}
