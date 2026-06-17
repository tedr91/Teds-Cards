import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import {
  LIGHT_CARD_DESCRIPTION,
  LIGHT_CARD_EDITOR_TYPE,
  LIGHT_CARD_NAME,
  LIGHT_CARD_TYPE,
} from "./const";
import type { LightCardConfig } from "./types";

const DOUBLE_CLICK_MS = 250;
const BRIGHTNESS_STEP = 5;

/** Convert HA brightness (0–255) to the 1–100% scale HA uses for display. */
function brightnessToPct(brightness?: number): number {
  if (brightness == null) return 0;
  return Math.max(Math.round((brightness * 100) / 255), 1);
}

/** Whether a light entity exposes a brightness-capable color mode. */
function lightSupportsBrightness(stateObj: { attributes: { supported_color_modes?: string[] } }): boolean {
  const modes = stateObj.attributes.supported_color_modes ?? [];
  return modes.some((mode) => mode !== "onoff" && mode !== "unknown");
}

/** Resolve the brightness-bar fill color (when on) from config + entity state. */
function resolveBrightnessColor(
  mode: string | undefined,
  stateObj: { attributes: { rgb_color?: number[] } },
  custom?: number[],
): string {
  if (mode === "other" && Array.isArray(custom) && custom.length === 3) {
    return `rgb(${custom[0]}, ${custom[1]}, ${custom[2]})`;
  }
  if (mode === "light") {
    const rgb = stateObj.attributes.rgb_color;
    if (Array.isArray(rgb) && rgb.length === 3) {
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
    return "var(--tlc-on-fg)";
  }
  return "var(--tlc-accent)";
}

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
  type: LIGHT_CARD_TYPE,
  name: LIGHT_CARD_NAME,
  description: LIGHT_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#light-card",
});

@customElement(LIGHT_CARD_TYPE)
export class TedLightCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-light-card-editor");
    return document.createElement(LIGHT_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<LightCardConfig, "type"> {
    const lights = Object.keys(hass.states).filter((id) => id.startsWith("light."));
    return { entity: lights[0] ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: LightCardConfig;

  private _topClickTimer?: number;
  private _bottomClickTimer?: number;

  public setConfig(config: LightCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!config.entity) {
      throw new Error("You must specify an entity");
    }
    const domain = config.entity.split(".")[0];
    if (domain !== "light") {
      throw new Error(`ted-light-card only supports light entities (got '${domain}')`);
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 2;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 3,
      rows: 2,
      min_columns: 3,
      min_rows: 2,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config") || changed.has("layout")) return true;
    if (!changed.has("hass")) return false;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    return oldHass.states[this._config.entity] !== this.hass?.states[this._config.entity];
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._topClickTimer !== undefined) window.clearTimeout(this._topClickTimer);
    if (this._bottomClickTimer !== undefined) window.clearTimeout(this._bottomClickTimer);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClasses = {
      "theme-ted": themeMode === "ted-style",
      "theme-ha": themeMode === "ha",
    };

    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return html`
        <ha-card class=${classMap(themeClasses)}>
          <div class="not-found">
            Entity not found: <code>${this._config.entity}</code>
          </div>
        </ha-card>
      `;
    }

    const isOn = stateObj.state === "on";
    const isUnavailable = stateObj.state === "unavailable";
    const name = this._config.name || stateObj.attributes.friendly_name || this._config.entity;
    const icon = this._config.icon || stateObj.attributes.icon || "mdi:lightbulb";
    const supportsBrightness = lightSupportsBrightness(stateObj);
    const brightnessPct = isOn ? brightnessToPct(stateObj.attributes.brightness) : 0;
    const stateLabel =
      isOn && supportsBrightness ? `${brightnessPct}%` : this._formatState(stateObj.state);
    const brightnessColor = isOn
      ? resolveBrightnessColor(
          this._config.brightness_color,
          stateObj,
          this._config.brightness_color_custom,
        )
      : "var(--tlc-muted)";

    return html`
      <ha-card
        class=${classMap({
          on: isOn,
          unavailable: isUnavailable,
          "layout-static": this.layout !== "grid",
          ...themeClasses,
        })}
      >
        ${supportsBrightness
          ? html`
              <div class="brightness" aria-hidden="true">
                <div
                  class="brightness-fill"
                  style=${styleMap({ height: `${brightnessPct}%`, backgroundColor: brightnessColor })}
                ></div>
              </div>
            `
          : nothing}
        <div class="stripe" aria-hidden="true"></div>
        <span class="stripe-symbol stripe-plus" aria-hidden="true">+</span>
        <span class="stripe-symbol stripe-minus" aria-hidden="true">−</span>
        <button
          type="button"
          class="zone zone-top"
          aria-label=${`${name} — turn on / increase brightness`}
          ?disabled=${isUnavailable}
          @click=${this._onTopClick}
        >
          <span class="primary">${name}</span>
        </button>
        <div class="divider" aria-hidden="true"></div>
        <button
          type="button"
          class="zone zone-bottom"
          aria-label="Decrease brightness / turn off"
          ?disabled=${isUnavailable}
          @click=${this._onBottomClick}
        >
          <div class="info">
            <div class="icon-shape">
              <ha-icon .icon=${icon}></ha-icon>
            </div>
            <span class="secondary">${stateLabel}</span>
          </div>
        </button>
      </ha-card>
    `;
  }

  private _formatState(state: string): string {
    if (!state) return "";
    return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");
  }

  private _onTopClick = (): void => {
    if (this._topClickTimer !== undefined) {
      window.clearTimeout(this._topClickTimer);
      this._topClickTimer = undefined;
      this._topDoubleClick();
      return;
    }
    this._topClickTimer = window.setTimeout(() => {
      this._topClickTimer = undefined;
      this._topSingleClick();
    }, DOUBLE_CLICK_MS);
  };

  private _onBottomClick = (): void => {
    if (this._bottomClickTimer !== undefined) {
      window.clearTimeout(this._bottomClickTimer);
      this._bottomClickTimer = undefined;
      this._bottomDoubleClick();
      return;
    }
    this._bottomClickTimer = window.setTimeout(() => {
      this._bottomClickTimer = undefined;
      this._bottomSingleClick();
    }, DOUBLE_CLICK_MS);
  };

  private _isOn(): boolean {
    if (!this.hass || !this._config) return false;
    return this.hass.states[this._config.entity]?.state === "on";
  }

  private _currentPct(): number {
    if (!this.hass || !this._config) return 0;
    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj || stateObj.state !== "on") return 0;
    return brightnessToPct(stateObj.attributes.brightness);
  }

  /** Top half, single click: off → on; on → step brightness up to the next 5%. */
  private _topSingleClick(): void {
    if (!this._isOn()) {
      this._callLight("turn_on", {});
      return;
    }
    const next = Math.min(100, (Math.floor(this._currentPct() / BRIGHTNESS_STEP) + 1) * BRIGHTNESS_STEP);
    this._setBrightness(next);
  }

  /** Top half, double click: full brightness. */
  private _topDoubleClick(): void {
    this._setBrightness(100);
  }

  /** Bottom half, single click: step brightness down to the next 5% (off below the lowest step). */
  private _bottomSingleClick(): void {
    if (!this._isOn()) return;
    const next = Math.max(0, (Math.ceil(this._currentPct() / BRIGHTNESS_STEP) - 1) * BRIGHTNESS_STEP);
    this._setBrightness(next);
  }

  /** Bottom half, double click: turn off. */
  private _bottomDoubleClick(): void {
    this._callLight("turn_off", {});
  }

  private _setBrightness(pct: number): void {
    if (pct <= 0) {
      this._callLight("turn_off", {});
      return;
    }
    this._callLight("turn_on", { brightness_pct: pct });
  }

  private _callLight(service: "turn_on" | "turn_off", data: Record<string, unknown>): void {
    if (!this.hass || !this._config) return;
    this.hass.callService("light", service, { entity_id: this._config.entity, ...data });
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    ha-card {
      /* Default "Ted's Home Theater" theme — Windows 11 Fluent (Mica dark),
         mirroring tedr91/ha-windows11-theme and the Denon Marantz card. */
      --tlc-surface: #2b2b2b;
      --tlc-elevated: #383838;
      --tlc-text: #ffffff;
      --tlc-muted: rgba(255, 255, 255, 0.786);
      --tlc-divider: rgba(255, 255, 255, 0.0931);
      --tlc-accent: #4cc2ff;
      --tlc-on-bg: rgba(255, 193, 7, 0.22);
      --tlc-on-fg: #ffc107;
      --tlc-radius: 8px;

      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 0;
      padding: 12px;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
      transition: background-color 180ms ease;
      outline: none;
      color: var(--tlc-text);
    }
    ha-card.theme-ted {
      background: var(--tlc-surface);
      border: 1px solid var(--tlc-divider);
      --ha-card-border-radius: var(--tlc-radius);
      font-family: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui,
        -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    }
    ha-card.theme-ha {
      /* Follow the active Home Assistant theme. */
      --tlc-surface: var(--ha-card-background, var(--card-background-color, #fff));
      --tlc-elevated: rgba(var(--rgb-disabled, 110, 110, 110), 0.18);
      --tlc-text: var(--primary-text-color);
      --tlc-muted: var(--secondary-text-color);
      --tlc-divider: var(--divider-color, rgba(120, 120, 120, 0.22));
      --tlc-accent: var(--primary-color, #03a9f4);
      --tlc-on-bg: rgba(var(--rgb-state-light, 255, 193, 7), 0.22);
      --tlc-on-fg: var(--state-light-active-color, #ffc107);
      --tlc-radius: var(--ha-card-border-radius, 12px);
    }
    ha-card.unavailable {
      opacity: 0.6;
    }
    /* getGridOptions only applies in the Sections (grid) view. In masonry / panel
       views, give the card a fixed height (200px-wide tile as a starting point). */
    ha-card.layout-static {
      width: 200px;
      height: 120px;
      margin: 0 auto;
    }
    .zone {
      position: relative;
      z-index: 1;
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }
    .zone-top {
      align-items: flex-start;
      /* The name must never bleed into the bottom half. */
      overflow: hidden;
    }
    .zone-bottom {
      align-items: flex-end;
    }
    .zone:focus-visible {
      box-shadow: inset 0 0 0 2px var(--tlc-accent);
      border-radius: 6px;
    }
    .zone:active {
      background-color: rgba(127, 127, 127, 0.1);
    }
    ha-card.unavailable .zone {
      cursor: not-allowed;
    }
    .divider {
      position: relative;
      z-index: 1;
      flex: none;
      height: 1px;
      margin: 0;
      background-color: var(--tlc-divider);
    }
    .icon-shape {
      display: inline-flex;
      line-height: 0;
      color: rgba(255, 255, 255, 0.5);
    }
    .info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      max-width: 100%;
    }
    .primary {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.25;
      color: var(--tlc-text);
      max-width: 100%;
      text-align: center;
      overflow-wrap: anywhere;
      /* Cap the name at two lines with an ellipsis. */
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
    .secondary {
      font-size: 12px;
      color: var(--tlc-muted);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .brightness {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 0;
      width: 9px;
      opacity: 0.5;
      background-color: var(--tlc-elevated);
      pointer-events: none;
    }
    .brightness-fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      transition: height 180ms ease, background-color 180ms ease;
    }
    /* Right-edge stripe mirroring the brightness bar's off state, with +/- hints. */
    .stripe {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 0;
      width: 9px;
      opacity: 0.5;
      background-color: var(--tlc-elevated);
      pointer-events: none;
    }
    .stripe-symbol {
      position: absolute;
      right: 0;
      z-index: 0;
      width: 9px;
      text-align: center;
      color: var(--tlc-text);
      opacity: 0.5;
      font-size: 13px;
      line-height: 1;
      pointer-events: none;
    }
    .stripe-plus {
      top: 25%;
      transform: translateY(-50%);
    }
    .stripe-minus {
      top: 75%;
      transform: translateY(-50%);
    }
    .not-found {
      padding: 12px;
      color: var(--error-color, #db4437);
      font-size: 13px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-light-card": TedLightCard;
  }
}
