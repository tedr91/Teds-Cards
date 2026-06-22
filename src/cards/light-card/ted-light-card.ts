import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  LIGHT_CARD_DESCRIPTION,
  LIGHT_CARD_EDITOR_TYPE,
  LIGHT_CARD_NAME,
  LIGHT_CARD_TYPE,
} from "./const";
import type { LightCardConfig, LightAction } from "./types";

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;
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

/** Resolve a color (theme accent / light's rgb_color / custom) from config + entity state. */
function resolveColor(
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
  return "var(--ted-style-accent)";
}

/** Resolve a CSS color from a `ui_color` value (hex string or theme color name). */
function cssColor(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("var")) {
    return value;
  }
  return `var(--${value}-color, ${value})`;
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
  private _iconClickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;

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
    if (this._iconClickTimer !== undefined) window.clearTimeout(this._iconClickTimer);
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClasses = {
      "ted-card": true,
      "ted-card--theme-ted-style": themeMode === "ted-style",
      "ted-card--theme-ha": themeMode === "ha",
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
    const brightnessPct = isOn
      ? supportsBrightness
        ? brightnessToPct(stateObj.attributes.brightness)
        : 100
      : 0;
    const stateLabel =
      isOn && supportsBrightness ? `${brightnessPct}%` : this._formatState(stateObj.state);
    const brightnessColor = isOn
      ? resolveColor(
          this._config.indicator_color,
          stateObj,
          this._config.indicator_color_custom,
        )
      : "var(--ted-style-muted)";
    const iconColor = isOn
      ? resolveColor(
          this._config.icon_color || "light",
          stateObj,
          this._config.icon_color_custom,
        )
      : "rgba(255, 255, 255, 0.5)";
    const bgOn = cssColor(this._config.background_on);
    const indicatorWidth = typeof this._config.indicator_width === "number" ? this._config.indicator_width : 4;
    const hintWidth = typeof this._config.hint_width === "number" ? this._config.hint_width : 8;
    // In a grid (Sections) view, honor the grid cell sizing. Everywhere else
    // (stacks, masonry, panel), render at the configured fixed size.
    const isGrid = this.layout === "grid";
    const cardWidth = typeof this._config.width === "number" ? this._config.width : 100;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : 120;
    const cardStyle: Record<string, string> = {
      "--ted-indicator-width": `${indicatorWidth}px`,
      "--ted-hint-width": `${hintWidth}px`,
    };
    if (isOn && bgOn) cardStyle.backgroundColor = bgOn;
    if (!isGrid) {
      cardStyle.width = `${cardWidth}px`;
      cardStyle.height = `${cardHeight}px`;
      cardStyle.margin = "0 auto";
    }
    const showName = this._config.show_name !== false;
    const showIcon = this._config.show_icon !== false;
    const showState = this._config.show_state !== false;
    const nameScale = typeof this._config.name_scale === "number" ? this._config.name_scale : 100;
    const iconScale = typeof this._config.icon_scale === "number" ? this._config.icon_scale : 150;
    const stateScale = typeof this._config.state_scale === "number" ? this._config.state_scale : 100;
    // The visual rocker effect only shows while the card behaves as a rocker.
    const showRockerEffect = this._config.rocker !== false && this._config.rocker_effect !== false;

    return html`
      <ha-card
        class=${classMap({
          on: isOn,
          unavailable: isUnavailable,
          ...themeClasses,
        })}
        style=${styleMap(cardStyle)}
        @pointerdown=${this._onCardPointerDown}
        @pointerup=${this._onCardPointerUp}
        @pointercancel=${this._onCardPointerUp}
        @pointerleave=${this._onCardPointerUp}
      >
        ${this._config.brushed ? brushedOverlay : nothing}
        ${showRockerEffect
          ? html`<div class="ted-rocker${isOn ? " is-bottom" : ""}" aria-hidden="true"></div>`
          : nothing}
        ${this._config.show_indicator !== false
          ? html`<div class="brightness" aria-hidden="true">
              <div
                class="brightness-fill"
                style=${styleMap({ height: `${brightnessPct}%`, backgroundColor: brightnessColor })}
              ></div>
            </div>`
          : nothing}
        ${this._config.show_hint
          ? html`
              <div class="stripe" aria-hidden="true"></div>
              <span class="stripe-symbol stripe-plus" aria-hidden="true">+</span>
              <span class="stripe-symbol stripe-minus" aria-hidden="true">−</span>
            `
          : nothing}
        ${showIcon
          ? html`
              <button
                type="button"
                class="icon-shape"
                style=${styleMap({ color: iconColor, "--mdc-icon-size": `${(24 * iconScale) / 100}px` })}
                aria-label=${name}
                ?disabled=${isUnavailable}
                @click=${this._onIconClick}
              >
                <ha-icon .icon=${icon}></ha-icon>
              </button>
            `
          : nothing}
        <div class="zone zone-top">
          ${showName
            ? html`<span class="primary" style=${styleMap({ fontSize: `${(14 * nameScale) / 100}px` })}>${name}</span>`
            : nothing}
        </div>
        <div class="divider" aria-hidden="true"></div>
        <div class="zone zone-bottom">
          ${showState
            ? html`<div class="info"><span class="secondary" style=${styleMap({ fontSize: `${(12 * stateScale) / 100}px` })}>${stateLabel}</span></div>`
            : nothing}
        </div>
        <button
          type="button"
          class="region region-top"
          aria-label=${`${name} — top half`}
          ?disabled=${isUnavailable}
          @click=${this._onTopClick}
        ></button>
        <button
          type="button"
          class="region region-bottom"
          aria-label=${`${name} — bottom half`}
          ?disabled=${isUnavailable}
          @click=${this._onBottomClick}
        ></button>
      </ha-card>
    `;
  }

  private _formatState(state: string): string {
    if (!state) return "";
    return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");
  }

  private _onTopClick = (): void => {
    if (this._consumeLongPress()) return;
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
    if (this._consumeLongPress()) return;
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

  private _supportsBrightness(): boolean {
    if (!this.hass || !this._config) return false;
    const stateObj = this.hass.states[this._config.entity];
    return !!stateObj && lightSupportsBrightness(stateObj);
  }

  /** When false, the card acts as a single button: every region runs the Icon behavior. */
  private _rockerEnabled(): boolean {
    return this._config?.rocker !== false;
  }

  /** Configured action for a region + gesture, falling back to a sensible default. */
  private _action(
    key: keyof LightCardConfig,
    dimmableDefault: LightAction,
    fallback: LightAction = dimmableDefault,
  ): LightAction {
    const configured = this._config?.[key] as LightAction | undefined;
    if (configured) return configured;
    return this._supportsBrightness() ? dimmableDefault : fallback;
  }

  private _topSingleClick(): void {
    if (!this._rockerEnabled()) {
      this._execAction(this._action("icon_tap", "toggle"));
      return;
    }
    this._execAction(this._action("up_tap", "increase", "full_on"));
  }

  private _topDoubleClick(): void {
    if (!this._rockerEnabled()) {
      this._execAction(this._action("icon_double_tap", "more_info"));
      return;
    }
    this._execAction(this._action("up_double_tap", "full_on"));
  }

  private _bottomSingleClick(): void {
    if (!this._rockerEnabled()) {
      this._execAction(this._action("icon_tap", "toggle"));
      return;
    }
    this._execAction(this._action("down_tap", "full_off"));
  }

  private _bottomDoubleClick(): void {
    if (!this._rockerEnabled()) {
      this._execAction(this._action("icon_double_tap", "more_info"));
      return;
    }
    this._execAction(this._action("down_double_tap", "full_off"));
  }

  /** Run one of the configurable actions. */
  private _execAction(action: LightAction): void {
    switch (action) {
      case "increase":
        this._stepUp();
        break;
      case "decrease":
        this._stepDown();
        break;
      case "full_on":
        this._fullOn();
        break;
      case "full_off":
        this._callLight("turn_off", {});
        break;
      case "toggle":
        this._toggle();
        break;
      case "more_info":
        this._moreInfo();
        break;
      case "none":
        break;
    }
  }

  /** Increase brightness to the next 5% (off → on at the memory brightness). */
  private _stepUp(): void {
    if (!this._supportsBrightness() || !this._isOn()) {
      this._turnOn();
      return;
    }
    const next = Math.min(100, (Math.floor(this._currentPct() / BRIGHTNESS_STEP) + 1) * BRIGHTNESS_STEP);
    this._setBrightness(next);
  }

  /** Decrease brightness to the next 5% (toggle-only lights turn off). */
  private _stepDown(): void {
    if (!this._supportsBrightness()) {
      this._callLight("turn_off", {});
      return;
    }
    if (!this._isOn()) return;
    const next = Math.max(0, (Math.ceil(this._currentPct() / BRIGHTNESS_STEP) - 1) * BRIGHTNESS_STEP);
    this._setBrightness(next);
  }

  /** Full brightness (toggle-only lights just turn on). */
  private _fullOn(): void {
    if (this._supportsBrightness()) {
      this._setBrightness(100);
    } else {
      this._callLight("turn_on", {});
    }
  }

  private _toggle(): void {
    if (this._isOn()) {
      this._callLight("turn_off", {});
    } else {
      this._turnOn();
    }
  }

  /** Turn the light on, applying the configured brightness "memory" when set. */
  private _turnOn(): void {
    const mem = this._memoryPct();
    if (mem != null) {
      this._callLight("turn_on", { brightness_pct: mem });
    } else {
      this._callLight("turn_on", {});
    }
  }

  /** Resolve the memory brightness (1–100) for dimmable lights, or null when unset. */
  private _memoryPct(): number | null {
    if (!this._supportsBrightness()) return null;
    const mode = this._config?.memory_mode;
    if (mode === "static") {
      const value = this._config?.memory_value;
      return typeof value === "number" ? this._clampPct(value) : 100;
    }
    if (mode === "helper") {
      const entity = this._config?.memory_entity;
      const stateObj = entity ? this.hass?.states[entity] : undefined;
      const value = stateObj ? Number(stateObj.state) : NaN;
      return Number.isFinite(value) ? this._clampPct(value) : null;
    }
    return null;
  }

  private _clampPct(value: number): number {
    return Math.min(100, Math.max(1, Math.round(value)));
  }

  private _setBrightness(pct: number): void {
    if (pct <= 0) {
      this._callLight("turn_off", {});
      return;
    }
    this._callLight("turn_on", { brightness_pct: pct });
    this._writeMemoryHelper(pct);
  }

  /** When using a memory helper, mirror brightness changes back into the helper. */
  private _writeMemoryHelper(pct: number): void {
    if (!this.hass || this._config?.memory_mode !== "helper") return;
    const entity = this._config.memory_entity;
    if (!entity) return;
    const domain = entity.split(".")[0];
    if (domain !== "input_number" && domain !== "number") return;
    this.hass.callService(domain, "set_value", { entity_id: entity, value: this._clampPct(pct) });
  }

  /**
   * Before turning the light off, capture its current brightness into the memory
   * helper so the value persists even if it was last changed elsewhere (more-info,
   * an automation, etc.). Only applies to dimmable lights using a memory helper.
   */
  private _captureBrightnessToMemory(): void {
    if (this._config?.memory_mode !== "helper") return;
    if (!this._supportsBrightness() || !this._isOn()) return;
    const pct = this._currentPct();
    if (pct > 0) this._writeMemoryHelper(pct);
  }

  private _callLight(service: "turn_on" | "turn_off", data: Record<string, unknown>): void {
    if (!this.hass || !this._config) return;
    if (service === "turn_off") this._captureBrightnessToMemory();
    this.hass.callService("light", service, { entity_id: this._config.entity, ...data });
  }

  // Long-press on a region runs that region's configured hold action. We arm a
  // timer on pointer down and cancel it on release; the resulting click is suppressed.
  private _onCardPointerDown = (ev: PointerEvent): void => {
    this._longPressFired = false;
    const region = this._regionFromEvent(ev);
    if (!region) return;
    const action = this._holdActionFor(region);
    if (action === "none") return;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._execAction(action);
    }, LONG_PRESS_MS);
  };

  private _regionFromEvent(ev: Event): "up" | "down" | "icon" | undefined {
    for (const el of ev.composedPath()) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.classList.contains("icon-shape")) return "icon";
      if (el.classList.contains("region-top")) return "up";
      if (el.classList.contains("region-bottom")) return "down";
      if (el === this) return undefined;
    }
    return undefined;
  }

  private _holdActionFor(region: "up" | "down" | "icon"): LightAction {
    if (!this._rockerEnabled()) return this._action("icon_hold", "more_info");
    if (region === "up") return this._action("up_hold", "more_info");
    if (region === "down") return this._action("down_hold", "more_info");
    return this._action("icon_hold", "more_info");
  }

  private _onCardPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  private _consumeLongPress(): boolean {
    if (this._longPressFired) {
      this._longPressFired = false;
      return true;
    }
    return false;
  }

  /** Icon: single click and double click run configurable actions. */
  private _onIconClick = (ev: Event): void => {
    ev.stopPropagation();
    if (this._consumeLongPress()) return;
    if (this._iconClickTimer !== undefined) {
      window.clearTimeout(this._iconClickTimer);
      this._iconClickTimer = undefined;
      this._execAction(this._action("icon_double_tap", "more_info"));
      return;
    }
    this._iconClickTimer = window.setTimeout(() => {
      this._iconClickTimer = undefined;
      this._execAction(this._action("icon_tap", "toggle"));
    }, DOUBLE_CLICK_MS);
  };

  private _moreInfo(): void {
    if (!this._config) return;
    fireEvent(this, "hass-more-info", { entityId: this._config.entity });
  }

  static styles = [
    tedStyleTheme,
    css`
    :host {
      display: block;
      height: 100%;
    }
    ha-card {
      /* Light-card-specific "on" color (amber) — no equivalent in the shared token set. */
      --tlc-on-fg: #ffc107;
      --tlc-on-bg: rgba(255, 193, 7, 0.22);

      position: relative;
      isolation: isolate;
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
      color: var(--ted-style-text);
    }
    ha-card.ted-card--theme-ha {
      /* Follow the active Home Assistant theme for the light's amber "on" color. */
      --tlc-on-fg: var(--state-light-active-color, #ffc107);
      --tlc-on-bg: rgba(var(--rgb-state-light, 255, 193, 7), 0.22);
    }
    ha-card.unavailable {
      opacity: 0.6;
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
      pointer-events: none;
    }
    .zone-top {
      align-items: flex-start;
      /* The name must never bleed into the bottom half. */
      overflow: hidden;
    }
    .zone-bottom {
      align-items: flex-end;
    }
    /* The three interactive regions overlay the whole card (padding + hint bars). */
    .region {
      position: absolute;
      left: 0;
      right: 0;
      height: 50%;
      z-index: 3;
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }
    .region-top {
      top: 0;
    }
    .region-bottom {
      bottom: 0;
    }
    .region:focus-visible {
      box-shadow: inset 0 0 0 2px var(--ted-style-accent);
    }
    .region:active {
      background-color: rgba(127, 127, 127, 0.1);
    }
    ha-card.unavailable .region {
      cursor: not-allowed;
    }
    .divider {
      position: relative;
      z-index: -2;
      flex: none;
      height: 1px;
      margin: 0;
      /* Engraved/sunken look: a dark groove with a faint highlight just below. */
      background-color: rgba(35, 35, 35, 0.45);
      box-shadow: 0 1px 0 rgba(235, 235, 235, 0.13);
    }
    .icon-shape {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 4;
      display: inline-flex;
      line-height: 0;
      background: none;
      border: none;
      margin: 0;
      padding: 0;
      cursor: pointer;
      outline: none;
      transition: color 180ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .icon-shape:focus-visible {
      box-shadow: 0 0 0 2px var(--ted-style-accent);
    }
    .icon-shape:active {
      transform: translate(-50%, -50%) scale(0.92);
    }
    ha-card.unavailable .icon-shape {
      cursor: not-allowed;
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
      color: var(--ted-style-text);
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
      color: var(--ted-style-muted);
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
      width: var(--ted-indicator-width, 4px);
      opacity: 0.5;
      background-color: var(--ted-style-surface-2);
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
      width: var(--ted-hint-width, 8px);
      opacity: 0.5;
      background-color: var(--ted-style-surface-2);
      pointer-events: none;
    }
    .stripe-symbol {
      position: absolute;
      right: 0;
      z-index: 0;
      width: var(--ted-hint-width, 8px);
      text-align: center;
      color: var(--ted-style-text);
      opacity: 0.5;
      font-size: calc(var(--ted-hint-width, 8px) * 1.6);
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
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-light-card": TedLightCard;
  }
}
