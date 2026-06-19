import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  APPLE_TV_COMMANDS,
  APP_LAUNCH_SLOTS,
  KALEIDESCAPE_COMMANDS,
  REMOTE_CARD_DESCRIPTION,
  REMOTE_CARD_EDITOR_TYPE,
  REMOTE_CARD_NAME,
  REMOTE_CARD_TYPE,
  entityFamily,
} from "./const";
import type { DeviceFamily, RemoteButton, RemoteCardConfig } from "./types";

/** States that count as "not powered on" for a media_player / remote entity. */
const OFF_STATES = ["off", "standby", "unavailable", "unknown"];

/** Max gap between two taps to count as a double-click. */
const DOUBLE_CLICK_MS = 250;

/** Resolve a `ui_color` value (hex/rgb/hsl/var or a theme color name) to a CSS color. */
function cssColor(value?: string): string | undefined {
  if (!value) return undefined;
  if (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("var")
  ) {
    return value;
  }
  return `var(--${value}-color, ${value})`;
}

/** Resolved Home Assistant service call. */
interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** mdi icon for each logical button. */
const BUTTON_ICONS: Record<RemoteButton, string> = {
  power: "mdi:power",
  up: "mdi:chevron-up",
  down: "mdi:chevron-down",
  left: "mdi:chevron-left",
  right: "mdi:chevron-right",
  select: "mdi:circle-medium",
  back: "mdi:arrow-left",
  home: "mdi:home-outline",
  menu: "mdi:menu",
  play_pause: "mdi:play-pause",
  rewind: "mdi:rewind",
  fast_forward: "mdi:fast-forward",
  skip_previous: "mdi:skip-previous",
  skip_next: "mdi:skip-next",
  volume_up: "mdi:volume-plus",
  volume_down: "mdi:volume-minus",
};

/** Per-family icon overrides (Apple TV uses Siri-remote-style glyphs). */
const FAMILY_BUTTON_ICONS: Partial<Record<DeviceFamily, Partial<Record<RemoteButton, string>>>> = {
  "apple-tv": {
    back: "mdi:chevron-left",
    home: "mdi:monitor",
  },
};

const BUTTON_LABELS: Record<RemoteButton, string> = {
  power: "Power",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  select: "Select",
  back: "Back",
  home: "Home",
  menu: "Menu",
  play_pause: "Play / Pause",
  rewind: "Rewind",
  fast_forward: "Fast forward",
  skip_previous: "Previous",
  skip_next: "Next",
  volume_up: "Volume up",
  volume_down: "Volume down",
};

/**
 * Built-in device-family brand logos shown in the header (no external assets).
 * Apple mark (simple-icons, tinted with the card text color) for Apple TV; the
 * Kaleidescape multi-colour diamond mark (from HA-Firemote) for Kaleidescape.
 */
const DEVICE_LOGOS: Record<DeviceFamily, TemplateResult> = {
  "apple-tv": html`<svg class="device-logo device-logo--mono" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z"
    ></path>
  </svg>`,
  kaleidescape: html`<svg class="device-logo" viewBox="0 0 24 24" fill-rule="evenodd" aria-hidden="true">
    <path d="M1.36 17.58L5.46 15.21L1.36 12.85Z" fill="#ffb612"></path>
    <path d="M1.36 11.15L5.46 8.79L1.36 6.42Z" fill="#739abc"></path>
    <path d="M1.85 18.42L5.95 20.79L5.95 16.06Z" fill="#739abc"></path>
    <path d="M1.85 12L5.95 14.36L5.95 9.64Z" fill="#165788"></path>
    <path d="M1.85 5.58L5.95 7.94L5.95 3.21Z" fill="#165788"></path>
    <path d="M6.93 14.36L11.02 12L6.93 9.64Z" fill="#165788"></path>
    <path d="M6.93 7.94L11.02 5.58L6.93 3.21Z" fill="#165788"></path>
    <path d="M7.42 21.64L11.51 24L11.51 19.27Z" fill="#739abc"></path>
    <path d="M7.42 15.21L11.51 17.58L11.51 12.85Z" fill="#739abc"></path>
    <path d="M7.42 8.79L11.51 11.15L11.51 6.42Z" fill="#ffb612"></path>
    <path d="M12.49 24L16.58 21.64L12.49 19.27Z" fill="#739abc"></path>
    <path d="M12.49 17.58L16.58 15.21L12.49 12.85Z" fill="#739abc"></path>
    <path d="M12.49 11.15L16.58 8.79L12.49 6.42Z" fill="#739abc"></path>
    <path d="M12.49 4.73L16.58 2.36L12.49 0Z" fill="#165788"></path>
    <path d="M12.98 18.42L17.07 20.79L17.07 16.06Z" fill="#165788"></path>
    <path d="M12.98 5.58L17.07 7.94L17.07 3.21Z" fill="#739abc"></path>
    <path d="M18.05 20.79L22.15 18.42L18.05 16.06Z" fill="#ffb612"></path>
    <path d="M18.05 7.94L22.15 5.58L18.05 3.21Z" fill="#165788"></path>
    <path d="M18.54 15.21L22.64 17.58L22.64 12.85Z" fill="#165788"></path>
    <path d="M18.54 8.79L22.64 11.15L22.64 6.42Z" fill="#165788"></path>
  </svg>`,
};

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

registerCustomCard({
  type: REMOTE_CARD_TYPE,
  name: REMOTE_CARD_NAME,
  description: REMOTE_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#remote-card",
});

@customElement(REMOTE_CARD_TYPE)
export class TedRemoteCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-remote-card-editor");
    return document.createElement(REMOTE_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<RemoteCardConfig, "type"> {
    const remotes = Object.keys(hass.states).filter((id) => id.startsWith("remote."));
    return { remote_entity: remotes[0] ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: RemoteCardConfig;

  /** Pending single-click timers, keyed by button, for double-click detection. */
  private _clickTimers = new Map<RemoteButton, number>();

  public setConfig(config: RemoteCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!config.remote_entity) {
      throw new Error("You must specify a remote entity");
    }
    if (config.remote_entity.split(".")[0] !== "remote") {
      throw new Error("remote_entity must be a remote.* entity");
    }
    if (config.media_player_entity && config.media_player_entity.split(".")[0] !== "media_player") {
      throw new Error("media_player_entity must be a media_player.* entity");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 6,
      rows: 6,
      min_columns: 4,
      min_rows: 3,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config") || changed.has("layout")) return true;
    if (!changed.has("hass")) return false;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    const ids = [this._config.remote_entity, this._config.media_player_entity].filter(
      (id): id is string => !!id,
    );
    return ids.some((id) => oldHass.states[id] !== this.hass?.states[id]);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const family = this._family();
    const theme = this._config.theme ?? "manufacturer";
    const themeClasses = {
      "ted-card": true,
      "ted-card--theme-ted-style": theme === "ted-style",
      "ted-card--theme-ha": theme === "ha",
      "ted-card--theme-mfr": theme === "manufacturer",
      "mfr--apple-tv": theme === "manufacturer" && family === "apple-tv",
      "mfr--kaleidescape": theme === "manufacturer" && family === "kaleidescape",
      "rc--apple-tv": family === "apple-tv",
      "rc--kaleidescape": family === "kaleidescape",
    };

    const stateObj = this.hass.states[this._config.remote_entity];
    if (!stateObj) {
      return html`
        <ha-card class=${classMap(themeClasses)}>
          <div class="not-found">
            Entity not found: <code>${this._config.remote_entity}</code>
          </div>
        </ha-card>
      `;
    }

    const isAppleTv = family === "apple-tv";
    const isKaleidescape = family === "kaleidescape";
    const isOn = this._isOn();
    const isPlaying = this._isPlaying();
    const name = this._config.name || stateObj.attributes.friendly_name || this._config.remote_entity;
    const showIcon = this._config.show_icon !== false;
    const iconScale = typeof this._config.icon_scale === "number" ? this._config.icon_scale : 100;
    const showName = this._config.show_name === true;
    const showStatus = this._config.show_status_indicator === true;
    const scale = typeof this._config.scale === "number" ? this._config.scale : 100;

    const cardStyle: Record<string, string> = {
      "--rc-scale": String(scale / 100),
      "--rc-icon-scale": String(iconScale / 100),
    };
    const isGrid = this.layout === "grid";
    if (!isGrid) cardStyle.margin = "0 auto";
    const bgOverride = cssColor(this._config.background);
    if (bgOverride) cardStyle.background = bgOverride;
    // Kaleidescape's manufacturer look has a brushed-metal sheen; honor the explicit toggle too.
    const showBrushed =
      this._config.brushed === true || (theme === "manufacturer" && isKaleidescape);

    const launchers = isAppleTv ? this._configuredLaunchers() : [];

    return html`
      <ha-card class=${classMap(themeClasses)} style=${styleMap(cardStyle)}>
        ${showBrushed ? brushedOverlay : nothing}
        <div class="header-row">
          <div class="header-lead">
            ${showIcon ? DEVICE_LOGOS[family] : nothing}
            ${showName
              ? html`<div
                  class="header"
                  style=${styleMap({
                    fontSize: `calc(1.05rem * ${(this._config.name_scale ?? 100) / 100})`,
                  })}
                  title=${name}
                  >${name}</div
                >`
              : nothing}
          </div>
          <div class="header-actions">
            ${showStatus
              ? html`<div class="header-status">
                  <span
                    class=${classMap({
                      "status-dot": true,
                      "status-dot--on": isOn,
                      "status-dot--off": !isOn,
                    })}
                    title=${this._statusLabel()}
                  ></span>
                </div>`
              : nothing}
            ${this._renderPowerButton(isOn)}
          </div>
        </div>
        <div class="remote-body">
          <div class="dpad" aria-label="Directional pad">
            <div class="dpad-ring">
              ${this._renderButton("up", { cls: "dpad-q dpad-up" })}
              ${this._renderButton("right", { cls: "dpad-q dpad-right" })}
              ${this._renderButton("left", { cls: "dpad-q dpad-left" })}
              ${this._renderButton("down", { cls: "dpad-q dpad-down" })}
            </div>
            ${this._renderButton("select", { cls: "dpad-center" })}
          </div>

          <div class="row nav">
            ${this._renderButton("back")} ${this._renderButton("home")}
            ${isKaleidescape ? this._renderButton("menu") : nothing}
          </div>

          <div class="row transport">
            ${isKaleidescape
              ? this._renderButton("rewind", { doubleClick: "skip_previous" })
              : nothing}
            ${this._renderButton("play_pause", { lit: isPlaying })}
            ${isKaleidescape
              ? this._renderButton("fast_forward", { doubleClick: "skip_next" })
              : nothing}
          </div>

          ${launchers.length
            ? html`<div class="app-grid">
                ${launchers.map(
                  (source) => html`<button
                    type="button"
                    class="app-btn"
                    title=${source}
                    @click=${() => this._launch(source)}
                  >
                    ${source}
                  </button>`,
                )}
              </div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  /** Render a single remote button. Returns `nothing` if the button has no mapping. */
  private _renderButton(
    button: RemoteButton,
    opts: { lit?: boolean; cls?: string; text?: string; doubleClick?: RemoteButton } = {},
  ): TemplateResult | typeof nothing {
    if (!this._resolve(button)) return nothing;
    const classes: Record<string, boolean> = { rbtn: true, lit: !!opts.lit };
    if (opts.cls) classes[opts.cls] = true;
    const icon = FAMILY_BUTTON_ICONS[this._family()]?.[button] ?? BUTTON_ICONS[button];
    const label = opts.doubleClick
      ? `${BUTTON_LABELS[button]} (double-tap: ${BUTTON_LABELS[opts.doubleClick]})`
      : BUTTON_LABELS[button];
    return html`
      <button
        type="button"
        class=${classMap(classes)}
        aria-label=${label}
        title=${label}
        @click=${() => this._onButtonClick(button, opts.doubleClick)}
      >
        ${opts.text
          ? html`<span class="rbtn-text">${opts.text}</span>`
          : html`<ha-icon .icon=${icon}></ha-icon>`}
      </button>
    `;
  }

  /**
   * Route a button click: when a `doubleClick` action is bound, a single tap
   * fires `button` after a short delay and a second tap within the window fires
   * `doubleClick` instead; otherwise the press is immediate.
   */
  private _onButtonClick(button: RemoteButton, doubleClick?: RemoteButton): void {
    if (!doubleClick) {
      this._press(button);
      return;
    }
    const pending = this._clickTimers.get(button);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      this._clickTimers.delete(button);
      this._press(doubleClick);
      return;
    }
    const timer = window.setTimeout(() => {
      this._clickTimers.delete(button);
      this._press(button);
    }, DOUBLE_CLICK_MS);
    this._clickTimers.set(button, timer);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of this._clickTimers.values()) window.clearTimeout(timer);
    this._clickTimers.clear();
  }

  /** Dedicated circular power button in the header (matches the DenonMarantz card). */
  private _renderPowerButton(powerIsOn: boolean): TemplateResult {
    return html`
      <button
        type="button"
        class=${classMap({
          "power-button": true,
          "power-button--on": powerIsOn,
          "power-button--off": !powerIsOn,
        })}
        role="switch"
        aria-checked=${powerIsOn ? "true" : "false"}
        aria-label="Toggle power"
        title="Toggle power"
        @click=${() => this._press("power")}
      >
        <svg class="power-button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a1 1 0 0 1 1 1v8a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1zm5.66 2.93a1 1 0 0 1 1.41 0 9 9 0 1 1-12.73 0 1 1 0 1 1 1.41 1.42 7 7 0 1 0 9.9 0 1 1 0 0 1 0-1.42z"
          ></path>
        </svg>
      </button>
    `;
  }

  private _press = (button: RemoteButton): void => {
    const call = this._resolve(button);
    if (!call || !this.hass) return;
    this.hass.callService(call.domain, call.service, call.data);
    this._haptic();
  };

  private _launch(source: string): void {
    const mp = this._config?.media_player_entity;
    if (!this.hass || !mp || !source) return;
    this.hass.callService("media_player", "select_source", { entity_id: mp, source });
    this._haptic();
  }

  /** Resolve the concrete service call for a logical button, or undefined if unsupported. */
  private _resolve(button: RemoteButton): ServiceCall | undefined {
    const cfg = this._config;
    if (!cfg) return undefined;
    const remote = cfg.remote_entity;
    const mp = cfg.media_player_entity;
    const family = this._family();

    if (button === "power") {
      const on = this._isOn();
      if (mp) {
        return { domain: "media_player", service: on ? "turn_off" : "turn_on", data: { entity_id: mp } };
      }
      return { domain: "remote", service: on ? "turn_off" : "turn_on", data: { entity_id: remote } };
    }

    if (button === "play_pause") {
      let command: string;
      if (mp) {
        command = this._isPaused() ? "play" : "pause";
      } else if (family === "apple-tv") {
        command = "play_pause";
      } else {
        command = "pause";
      }
      return { domain: "remote", service: "send_command", data: { entity_id: remote, command } };
    }

    if (button === "home" && family === "kaleidescape") {
      const command = cfg.kaleidescape_home || "home";
      return { domain: "remote", service: "send_command", data: { entity_id: remote, command } };
    }

    const map = family === "apple-tv" ? APPLE_TV_COMMANDS : KALEIDESCAPE_COMMANDS;
    const command = map[button];
    if (!command) return undefined;
    return { domain: "remote", service: "send_command", data: { entity_id: remote, command } };
  }

  /** The device family: explicit config wins, otherwise auto-detected from the remote entity. */
  private _family(): DeviceFamily {
    const fam = this._config?.device_family;
    if (fam === "apple-tv" || fam === "kaleidescape") return fam;
    return entityFamily(this.hass, this._config?.remote_entity) ?? "apple-tv";
  }

  /** The entity whose state best represents the device (media_player when configured). */
  private _stateObj() {
    if (!this.hass || !this._config) return undefined;
    const mp = this._config.media_player_entity;
    return this.hass.states[mp ?? this._config.remote_entity];
  }

  private _isOn(): boolean {
    if (!this.hass || !this._config) return false;
    const mp = this._config.media_player_entity;
    if (mp) {
      const s = this.hass.states[mp]?.state;
      return s !== undefined && !OFF_STATES.includes(s);
    }
    return this.hass.states[this._config.remote_entity]?.state === "on";
  }

  private _mediaState(): string | undefined {
    if (!this.hass || !this._config?.media_player_entity) return undefined;
    return this.hass.states[this._config.media_player_entity]?.state;
  }

  private _isPlaying(): boolean {
    return this._mediaState() === "playing";
  }

  private _isPaused(): boolean {
    return this._mediaState() === "paused";
  }

  private _statusLabel(): string {
    const stateObj = this._stateObj();
    const state = stateObj?.state;
    if (!state || state === "unavailable" || state === "unknown") return "Unavailable";
    switch (state) {
      case "playing":
        return "Playing";
      case "paused":
        return "Paused";
      case "idle":
        return "Idle";
      case "buffering":
        return "Buffering";
      case "standby":
      case "off":
        return "Off";
      case "on":
        return "On";
      default:
        return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");
    }
  }

  /** Non-empty configured app-launch sources, in order. */
  private _configuredLaunchers(): string[] {
    const cfg = this._config;
    if (!cfg) return [];
    const out: string[] = [];
    for (let i = 1; i <= APP_LAUNCH_SLOTS; i++) {
      const value = cfg[`app_launch_${i}` as keyof RemoteCardConfig] as string | undefined;
      if (value && value.trim()) out.push(value);
    }
    return out;
  }

  private _haptic(): void {
    this.dispatchEvent(new CustomEvent("haptic", { bubbles: true, composed: true, detail: "light" }));
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        --rc-scale: 1;
        --rc-btn: calc(44px * var(--rc-scale));
        --rc-gap: calc(10px * var(--rc-scale));
        --rc-pad-x: calc(16px * var(--rc-scale));
        /* Power "on" glow: green for manufacturer / ted-style, theme color for HA. */
        --rc-glow: var(--ted-style-success);

        position: relative;
        isolation: isolate;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
        color: var(--ted-style-text);
      }
      /* HA theme: the power "on" glow follows the active theme's accent color. */
      ha-card.ted-card--theme-ha {
        --rc-glow: var(--ted-style-accent);
      }
      /* Header area mirrors the DenonMarantz card: name + status dot + power button. */
      .header-row {
        align-items: center;
        display: flex;
        gap: var(--ted-style-gap);
        justify-content: space-between;
        padding: 16px 16px 4px;
      }
      .header-lead {
        align-items: center;
        display: inline-flex;
        gap: 10px;
        min-width: 0;
      }
      .device-logo {
        display: block;
        flex: none;
        height: calc(22px * var(--rc-icon-scale, 1));
        width: calc(22px * var(--rc-icon-scale, 1));
      }
      .device-logo--mono {
        fill: var(--ted-style-text);
      }
      .header {
        font-weight: 600;
        letter-spacing: 0.01em;
        line-height: 1.2;
        color: var(--ted-style-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .header-status {
        align-items: center;
        display: inline-flex;
        flex: none;
        gap: 8px;
      }
      .header-actions {
        align-items: center;
        display: inline-flex;
        flex: none;
        gap: 14px;
      }
      .status-dot {
        border-radius: 50%;
        flex: none;
        height: 10px;
        width: 10px;
        transition: background-color 0.25s ease, box-shadow 0.25s ease;
      }
      .status-dot--on {
        background: var(--ted-style-success);
        box-shadow: 0 0 8px color-mix(in srgb, var(--ted-style-success) 70%, transparent);
      }
      .status-dot--off {
        background: color-mix(in srgb, var(--ted-style-muted) 55%, transparent);
      }
      .power-button {
        align-items: center;
        background: var(--ted-style-surface-2);
        border: 1px solid var(--ted-style-divider);
        border-radius: 50%;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        box-sizing: border-box;
        color: color-mix(in srgb, var(--ted-style-text) 60%, transparent);
        cursor: pointer;
        display: inline-flex;
        flex: none;
        height: 30px;
        width: 30px;
        justify-content: center;
        padding: 0;
        transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease,
          color 0.2s ease, transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .power-button:hover {
        border-color: color-mix(in srgb, var(--ted-style-accent) 45%, var(--ted-style-divider));
      }
      .power-button:active {
        transform: scale(0.94);
      }
      .power-button:focus-visible {
        outline: 2px solid var(--ted-style-accent);
        outline-offset: 2px;
      }
      .power-button-icon {
        fill: currentColor;
        height: 16px;
        width: 16px;
      }
      /* ON: a glowing ring (icon color stays constant, only the ring glows). */
      .power-button--on {
        background: var(--ted-style-surface-2);
        border-color: var(--rc-glow);
        box-shadow: 0 0 0 1px var(--rc-glow),
          0 0 4px color-mix(in srgb, var(--rc-glow) 22%, transparent);
      }
      .remote-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--rc-gap);
        width: 100%;
        max-width: calc(12.286rem * var(--rc-scale));
        margin: 0 auto;
        padding: calc(8px * var(--rc-scale)) var(--rc-pad-x)
          calc(16px * var(--rc-scale));
        box-sizing: border-box;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--rc-gap);
        width: 100%;
      }
      /* Shared button look. */
      .rbtn {
        width: var(--rc-btn);
        height: var(--rc-btn);
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        border-radius: 50%;
        border: 1px solid var(--ted-style-divider);
        background-color: var(--ted-style-surface-2);
        color: var(--ted-style-text);
        cursor: pointer;
        padding: 0;
        outline: none;
        transition: background-color 120ms ease, transform 80ms ease, box-shadow 120ms ease,
          color 120ms ease;
        -webkit-tap-highlight-color: transparent;
        --mdc-icon-size: calc(22px * var(--rc-scale));
      }
      .rbtn:hover {
        background-color: color-mix(in srgb, var(--ted-style-surface-2) 80%, var(--ted-style-text) 20%);
      }
      .rbtn:active {
        transform: scale(0.92);
      }
      .rbtn:focus-visible {
        box-shadow: 0 0 0 2px var(--ted-style-accent);
      }
      .rbtn.lit {
        color: var(--ted-style-accent);
        box-shadow: 0 0 0 1px var(--ted-style-accent),
          0 0 calc(10px * var(--rc-scale)) rgba(76, 194, 255, 0.35);
      }
      .rbtn-text {
        font-size: calc(13px * var(--rc-scale));
        font-weight: 600;
        line-height: 1;
      }
      /* Directional pad: a rotated 2×2 diamond (matches Firemote) — quadrant
         buttons with filled-triangle arrows, plus an absolutely-centered button. */
      .dpad {
        /* Exact Firemote KA1 dimensions: dpadContainer is 11.3rem (× scale, where
           --rc-scale mirrors Firemote's --sz). It overflows the body padding. */
        position: relative;
        width: calc(11.3rem * var(--rc-scale));
        height: calc(11.3rem * var(--rc-scale));
        /* No horizontal auto margins: the disc is wider than the body content box,
           so auto margins would collapse to 0 and left-align it. align-self centers
           it (overflowing the padding equally on both sides). */
        margin: 0 0 calc(0.6rem * var(--rc-scale));
        align-self: center;
        display: grid;
        place-items: center;
      }
      .dpad-ring {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        transform: rotate(45deg);
        border-radius: 50%;
        overflow: hidden;
        border: calc(0.0714rem * var(--rc-scale)) solid var(--ted-style-divider);
        background: radial-gradient(
          circle at 50% 40%,
          color-mix(in srgb, var(--ted-style-surface-2) 88%, var(--ted-style-text) 12%),
          var(--ted-style-surface)
        );
      }
      .dpad-ring .rbtn {
        width: 100%;
        height: 100%;
        border-radius: 0;
        background: transparent;
        border: none;
        color: var(--ted-style-text);
      }
      .dpad-ring .rbtn ha-icon {
        display: none;
      }
      /* Each arrow is a triangle, counter-rotated to point outward from the disc. */
      .dpad-ring .rbtn::after {
        content: "";
        width: 0;
        height: 0;
        border-left: calc(0.4rem * var(--rc-scale)) solid transparent;
        border-right: calc(0.4rem * var(--rc-scale)) solid transparent;
        border-bottom: calc(0.62rem * var(--rc-scale)) solid currentColor;
        opacity: 0.82;
      }
      .dpad-up::after {
        transform: rotate(-45deg);
      }
      .dpad-right::after {
        transform: rotate(45deg);
      }
      .dpad-left::after {
        transform: rotate(-135deg);
      }
      .dpad-down::after {
        transform: rotate(135deg);
      }
      .dpad-ring .rbtn:hover {
        background: rgba(127, 127, 127, 0.16);
      }
      .dpad-ring .rbtn:active {
        background: rgba(0, 0, 0, 0.18);
      }
      .dpad-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        width: calc(4.6rem * var(--rc-scale));
        height: calc(4.6rem * var(--rc-scale));
        border-radius: 50%;
        background-color: var(--ted-style-surface) !important;
        border: calc(0.0714rem * var(--rc-scale)) solid var(--ted-style-divider) !important;
        color: var(--ted-style-text);
      }
      .dpad-center:active {
        transform: translate(-50%, -50%) scale(0.95);
      }
      /* ---- Apple TV family overrides (apply in every theme) ---- */
      /* D-pad directions are dots rather than chevrons. */
      .rc--apple-tv .dpad-ring .rbtn::after {
        width: calc(0.45rem * var(--rc-scale));
        height: calc(0.45rem * var(--rc-scale));
        border: none;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.82;
      }
      /* Center button is never labelled (no icon, no text), in every theme. */
      .dpad-center ha-icon,
      .dpad-center .rbtn-text {
        display: none;
      }
      /* Back, Home and Play/Pause are 25% larger. */
      .rc--apple-tv .row .rbtn {
        width: calc(var(--rc-btn) * 1.25);
        height: calc(var(--rc-btn) * 1.25);
        --mdc-icon-size: calc(27.5px * var(--rc-scale));
      }
      /* Play/Pause spans the combined width of Back + Home (plus the gap). */
      .rc--apple-tv .row.transport .rbtn {
        width: calc(var(--rc-btn) * 2.5 + var(--rc-gap));
        border-radius: calc(var(--rc-btn) * 0.625);
      }
      .app-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--rc-gap);
        width: 100%;
        margin-top: calc(var(--rc-gap) * 0.5);
      }
      .app-btn {
        min-height: calc(34px * var(--rc-scale));
        padding: 0 calc(10px * var(--rc-scale));
        border-radius: var(--ted-style-radius);
        border: 1px solid var(--ted-style-divider);
        background-color: var(--ted-style-surface-2);
        color: var(--ted-style-text);
        font-size: calc(12px * var(--rc-scale));
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: background-color 120ms ease, transform 80ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .app-btn:hover {
        background-color: color-mix(in srgb, var(--ted-style-surface-2) 80%, var(--ted-style-text) 20%);
      }
      .app-btn:active {
        transform: scale(0.97);
      }
      /* ---- Manufacturer styles (evoke the Firemote remote look per family) ---- */
      ha-card.ted-card--theme-mfr {
        border-radius: 22px;
      }
      /* Apple TV — silver aluminium body with dark round buttons. */
      ha-card.mfr--apple-tv {
        background: linear-gradient(0deg, #939496 0%, #cfd3d5 100%);
        border: 1px solid #d1d1d1;
        color: #1d1d1f;
        --ted-style-text: #1d1d1f;
        --ted-style-muted: rgba(0, 0, 0, 0.55);
        --ted-style-divider: rgba(0, 0, 0, 0.18);
      }
      .mfr--apple-tv .rbtn {
        background-color: #212121;
        border-color: #000000;
        color: #c6c6c6;
      }
      .mfr--apple-tv .rbtn:hover {
        background-color: #2c2c2c;
      }
      /* Back / Home / Play-Pause mirror Firemote's apple "remote-button" styling. */
      .mfr--apple-tv .row .rbtn {
        box-shadow: 0 calc(0.214rem * var(--rc-scale)) calc(0.143rem * var(--rc-scale)) 0
          rgb(0 0 0 / 13%);
      }
      .mfr--apple-tv .row .rbtn:active {
        transform: none;
        background: linear-gradient(180deg, #2a2a2f 0%, #232327 100%);
        box-shadow: inset 0 calc(0.14rem * var(--rc-scale)) calc(0.3rem * var(--rc-scale))
          rgb(0 0 0 / 55%);
      }
      .mfr--apple-tv .row .rbtn.lit {
        color: #c6c6c6;
        box-shadow: 0 0 calc(0.857rem * var(--rc-scale)) calc(0.0714rem * var(--rc-scale))
          rgb(171 253 255 / 15%);
      }
      /* Apple clickpad matches Firemote: flat #141414 disc with subtle quadrant
         outlines and a lighter center. Defined at the family level so the d-pad
         looks identical in every theme. */
      .rc--apple-tv .dpad-ring {
        background: #141414;
        border-color: #000000;
        box-shadow: rgb(20 20 20) calc(0.1428rem * var(--rc-scale))
          calc(0.1428rem * var(--rc-scale)) calc(0.4285rem * var(--rc-scale));
      }
      .rc--apple-tv .dpad-ring .rbtn {
        color: #c6c6c6;
        outline: solid #2e2e2e calc(0.0714rem * var(--rc-scale));
      }
      .rc--apple-tv .dpad-ring .rbtn:hover {
        background-color: rgba(255, 255, 255, 0.08);
      }
      .rc--apple-tv .dpad-center {
        width: calc(5.7rem * var(--rc-scale));
        height: calc(5.7rem * var(--rc-scale));
        background: linear-gradient(180deg, #000000 0%, #303030 100%) !important;
        border: calc(0.0714rem * var(--rc-scale)) solid #000000 !important;
        outline: solid #2e2e2e calc(0.0714rem * var(--rc-scale));
        color: #c6c6c6;
      }
      /* Pressed center: Firemote's deeper inset shadow, no scale. */
      .rc--apple-tv .dpad-center:active {
        transform: translate(-50%, -50%);
        box-shadow: inset 0 calc(0.28rem * var(--rc-scale)) calc(0.5rem * var(--rc-scale))
          rgb(0 0 0 / 85%);
      }
      /* Apple power button matches Firemote: transparent (silver body shows
         through), thin gray border, dark glyph — keeping our green "on" glow. */
      .mfr--apple-tv .power-button {
        background: none;
        border-color: rgba(0, 0, 0, 0.35);
        box-shadow: none;
        color: #1d1d1f;
      }
      .mfr--apple-tv .power-button--on {
        background: none;
        border-color: var(--rc-glow);
        box-shadow: 0 0 0 1px var(--rc-glow),
          0 0 4px color-mix(in srgb, var(--rc-glow) 22%, transparent);
      }
      .mfr--apple-tv .app-btn {
        background-color: #212121;
        border-color: #000000;
        color: #e6e6e6;
      }
      /* Kaleidescape — dark brushed body, slate buttons, blue d-pad. */
      ha-card.mfr--kaleidescape {
        background: linear-gradient(145deg, #2e2e32 0%, #222226 45%, #16161a 100%);
        border: 1px solid #14141a;
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      /* Nav/transport buttons: rounded-rect slate keys (Firemote KA1 remote-button). */
      .mfr--kaleidescape .row .rbtn {
        width: calc(var(--rc-btn) * 1.05);
        height: calc(var(--rc-btn) * 0.72);
        border-radius: calc(7px * var(--rc-scale));
        background: linear-gradient(180deg, #3c3c42 0%, #2c2c31 100%);
        border: calc(1px * var(--rc-scale)) solid #101015;
        box-shadow: 0 calc(1.5px * var(--rc-scale)) calc(2.5px * var(--rc-scale)) rgb(0 0 0 / 48%),
          inset 0 calc(1px * var(--rc-scale)) 0 rgb(255 255 255 / 7%);
        color: #f4f5f7;
        --mdc-icon-size: calc(18px * var(--rc-scale));
      }
      .mfr--kaleidescape .row .rbtn:hover {
        filter: brightness(1.1);
      }
      .mfr--kaleidescape .row .rbtn:active {
        transform: none;
        background: linear-gradient(180deg, #2a2a2f 0%, #232327 100%);
        box-shadow: inset 0 calc(2px * var(--rc-scale)) calc(4px * var(--rc-scale)) rgb(0 0 0 / 55%);
      }
      /* Blue brushed disc with a conic sheen over a radial highlight (Firemote
         KA1). Defined at the family level so it's identical in every theme. */
      .rc--kaleidescape .dpad-ring {
        background: conic-gradient(
            from 0deg at 50% 50%,
            rgba(255, 255, 255, 0.1),
            rgba(0, 0, 0, 0.12) 25%,
            rgba(255, 255, 255, 0.1) 50%,
            rgba(0, 0, 0, 0.12) 75%,
            rgba(255, 255, 255, 0.1) 100%
          ),
          radial-gradient(circle at 50% 36%, #6189bd 0%, #41699c 45%, #324f78 100%);
        border: calc(0.12rem * var(--rc-scale)) solid #0d0f15;
        box-shadow: 0 calc(0.22rem * var(--rc-scale)) calc(0.6rem * var(--rc-scale)) rgb(0 0 0 / 65%),
          0 0 0 calc(0.14rem * var(--rc-scale)) rgb(8 10 16 / 85%),
          0 0 0 calc(0.3rem * var(--rc-scale)) rgb(255 255 255 / 5%),
          inset 0 calc(0.32rem * var(--rc-scale)) calc(0.45rem * var(--rc-scale)) rgb(0 0 0 / 55%),
          inset 0 calc(-0.16rem * var(--rc-scale)) calc(0.32rem * var(--rc-scale)) rgb(255 255 255 / 12%);
      }
      /* Dark translucent triangles (Firemote KA1). */
      .rc--kaleidescape .dpad-ring .rbtn::after {
        border-bottom-color: rgba(0, 0, 0, 0.4);
        opacity: 1;
      }
      .rc--kaleidescape .dpad-ring .rbtn:active {
        background: rgba(0, 0, 0, 0.18);
      }
      /* Large dark recessed center button. */
      .rc--kaleidescape .dpad-center {
        background: radial-gradient(circle at 50% 38%, #2c2c31 0%, #1b1b1f 70%, #131316 100%) !important;
        border: calc(0.0714rem * var(--rc-scale)) solid #0e0e12 !important;
        box-shadow: inset 0 calc(0.2rem * var(--rc-scale)) calc(0.4rem * var(--rc-scale)) rgb(0 0 0 / 75%),
          0 calc(0.05rem * var(--rc-scale)) calc(0.15rem * var(--rc-scale)) rgb(255 255 255 / 8%);
        color: #f4f5f7;
      }
      .not-found {
        padding: 12px;
        color: var(--error-color, #db4437);
        font-size: 13px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-remote-card": TedRemoteCard;
  }
}
