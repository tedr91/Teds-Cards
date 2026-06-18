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
  COVER_CARD_DESCRIPTION,
  COVER_CARD_EDITOR_TYPE,
  COVER_CARD_NAME,
  COVER_CARD_TYPE,
} from "./const";
import type { CoverCardConfig, CoverAction } from "./types";

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;
const POSITION_STEP = 5;

// cover supported_features bitmask.
const FEATURE_SET_POSITION = 4;
const FEATURE_OPEN_TILT = 16;
const FEATURE_CLOSE_TILT = 32;
const FEATURE_SET_TILT_POSITION = 128;

/** Clamp a value to the 0–100 scale and round it. */
function clampPct(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Step a 0–100 value to the next/previous multiple of POSITION_STEP. */
function stepPct(current: number, delta: number): number {
  if (delta > 0) return Math.min(100, (Math.floor(current / POSITION_STEP) + 1) * POSITION_STEP);
  return Math.max(0, (Math.ceil(current / POSITION_STEP) - 1) * POSITION_STEP);
}

/** Resolve a color (theme accent / custom) from config. */
function resolveColor(mode: string | undefined, custom?: number[]): string {
  if (mode === "other" && Array.isArray(custom) && custom.length === 3) {
    return `rgb(${custom[0]}, ${custom[1]}, ${custom[2]})`;
  }
  return "var(--ted-style-accent)";
}

/** Default icon for a cover based on its device_class and open/closed state. */
function defaultCoverIcon(deviceClass: string | undefined, isOpen: boolean): string {
  switch (deviceClass) {
    case "garage":
      return isOpen ? "mdi:garage-open" : "mdi:garage";
    case "door":
      return "mdi:door";
    case "gate":
      return isOpen ? "mdi:gate-open" : "mdi:gate";
    case "curtain":
      return isOpen ? "mdi:curtains" : "mdi:curtains-closed";
    case "blind":
    case "shade":
      return isOpen ? "mdi:blinds-open" : "mdi:blinds";
    case "window":
      return isOpen ? "mdi:window-open" : "mdi:window-closed";
    case "shutter":
    case "awning":
    default:
      return isOpen ? "mdi:window-shutter-open" : "mdi:window-shutter";
  }
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
  type: COVER_CARD_TYPE,
  name: COVER_CARD_NAME,
  description: COVER_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#cover-card",
});

@customElement(COVER_CARD_TYPE)
export class TedCoverCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-cover-card-editor");
    return document.createElement(COVER_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<CoverCardConfig, "type"> {
    const covers = Object.keys(hass.states).filter((id) => id.startsWith("cover."));
    return { entity: covers[0] ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: CoverCardConfig;

  private _topClickTimer?: number;
  private _bottomClickTimer?: number;
  private _iconClickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;

  public setConfig(config: CoverCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!config.entity) {
      throw new Error("You must specify an entity");
    }
    const domain = config.entity.split(".")[0];
    if (domain !== "cover") {
      throw new Error(`ted-cover-card only supports cover entities (got '${domain}')`);
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

    const isUnavailable = stateObj.state === "unavailable";
    const isMoving = this._isMoving();
    const isOpen = this._isOpen();
    const name = this._config.name || stateObj.attributes.friendly_name || this._config.entity;
    const icon =
      (isOpen && this._config.icon_open) ||
      this._config.icon ||
      (stateObj.attributes.icon as string | undefined) ||
      defaultCoverIcon(stateObj.attributes.device_class as string | undefined, isOpen);

    const pct = this._primaryPct();
    const stateLabel =
      !isMoving && this._hasPrimaryAttr() && pct > 0 ? `${pct}%` : this._formatState(stateObj.state);
    const positionColor = isOpen
      ? resolveColor(this._config.position_color, this._config.position_color_custom)
      : "var(--ted-style-muted)";
    const iconColor = isOpen
      ? resolveColor(this._config.icon_color, this._config.icon_color_custom)
      : "rgba(255, 255, 255, 0.5)";
    const showHint = this._config.show_hint !== false;
    const bgOpen = cssColor(this._config.background_open);
    // In a grid (Sections) view, honor the grid cell sizing. Everywhere else
    // (stacks, masonry, panel), render at the configured fixed size.
    const isGrid = this.layout === "grid";
    const cardWidth = typeof this._config.width === "number" ? this._config.width : 100;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : 120;
    const cardStyle: Record<string, string> = {};
    if (isOpen && bgOpen) cardStyle.backgroundColor = bgOpen;
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

    return html`
      <ha-card
        class=${classMap({
          open: isOpen,
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
        ${this._config.rocker !== false
          ? html`<div class="ted-rocker${isOpen ? " is-bottom" : ""}" aria-hidden="true"></div>`
          : nothing}
        <div class="position" aria-hidden="true">
          <div
            class="position-fill"
            style=${styleMap({ height: `${pct}%`, backgroundColor: positionColor })}
          ></div>
        </div>
        ${showHint
          ? html`
              <div class="stripe" aria-hidden="true"></div>
              <svg class="stripe-symbol stripe-up" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"></path>
              </svg>
              <svg class="stripe-symbol stripe-down" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"></path>
              </svg>
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
            ? html`<div class="info"><span class="secondary">${stateLabel}</span></div>`
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
      this._execAction(this._action("up_double_tap", "open"));
      return;
    }
    this._topClickTimer = window.setTimeout(() => {
      this._topClickTimer = undefined;
      this._execAction(this._action("up_tap", "open_step", "open"));
    }, DOUBLE_CLICK_MS);
  };

  private _onBottomClick = (): void => {
    if (this._consumeLongPress()) return;
    if (this._bottomClickTimer !== undefined) {
      window.clearTimeout(this._bottomClickTimer);
      this._bottomClickTimer = undefined;
      this._execAction(this._action("down_double_tap", "close"));
      return;
    }
    this._bottomClickTimer = window.setTimeout(() => {
      this._bottomClickTimer = undefined;
      this._execAction(this._action("down_tap", "close_step", "close"));
    }, DOUBLE_CLICK_MS);
  };

  // ---- State accessors ----

  private _stateObj() {
    if (!this.hass || !this._config) return undefined;
    return this.hass.states[this._config.entity];
  }

  private _features(): number {
    return Number(this._stateObj()?.attributes.supported_features ?? 0);
  }

  private _canSetPosition(): boolean {
    return (this._features() & FEATURE_SET_POSITION) !== 0;
  }

  private _canSetTilt(): boolean {
    return (this._features() & FEATURE_SET_TILT_POSITION) !== 0;
  }

  private _supportsTilt(): boolean {
    return (this._features() & (FEATURE_OPEN_TILT | FEATURE_CLOSE_TILT | FEATURE_SET_TILT_POSITION)) !== 0;
  }

  /** Whether either region step can drive a continuous value (position or tilt). */
  private _hasPrimary(): boolean {
    return this._canSetPosition() || this._canSetTilt();
  }

  private _positionAttr(): number | undefined {
    const value = this._stateObj()?.attributes.current_position;
    return typeof value === "number" ? value : undefined;
  }

  private _tiltAttr(): number | undefined {
    const value = this._stateObj()?.attributes.current_tilt_position;
    return typeof value === "number" ? value : undefined;
  }

  private _hasPrimaryAttr(): boolean {
    return this._positionAttr() !== undefined || this._tiltAttr() !== undefined;
  }

  /** The 0–100 value shown by the position bar (position, else tilt, else open/closed). */
  private _primaryPct(): number {
    const pos = this._positionAttr();
    if (pos !== undefined) return clampPct(pos);
    const tilt = this._tiltAttr();
    if (tilt !== undefined) return clampPct(tilt);
    return this._isOpen() ? 100 : 0;
  }

  private _isMoving(): boolean {
    const state = this._stateObj()?.state;
    return state === "opening" || state === "closing";
  }

  private _isClosed(): boolean {
    const stateObj = this._stateObj();
    if (!stateObj) return false;
    if (stateObj.state === "closed") return true;
    const pos = this._positionAttr();
    return pos !== undefined && pos <= 0;
  }

  private _isOpen(): boolean {
    const stateObj = this._stateObj();
    if (!stateObj || stateObj.state === "unavailable") return false;
    return !this._isClosed();
  }

  // ---- Action dispatch ----

  /** Configured action for a region + gesture, falling back to a sensible default. */
  private _action(
    key: keyof CoverCardConfig,
    primaryDefault: CoverAction,
    fallback: CoverAction = primaryDefault,
  ): CoverAction {
    const configured = this._config?.[key] as CoverAction | undefined;
    if (configured) return configured;
    return this._hasPrimary() ? primaryDefault : fallback;
  }

  /** Run one of the configurable actions. */
  private _execAction(action: CoverAction): void {
    switch (action) {
      case "open_step":
        this._stepOpen();
        break;
      case "close_step":
        this._stepClose();
        break;
      case "open":
        this._openFull();
        break;
      case "close":
        this._closeFull();
        break;
      case "toggle":
        this._toggle();
        break;
      case "stop":
        this._callCover("stop_cover", {});
        break;
      case "tilt_open":
        this._callCover("open_cover_tilt", {});
        break;
      case "tilt_close":
        this._callCover("close_cover_tilt", {});
        break;
      case "more_info":
        this._moreInfo();
        break;
      case "none":
        break;
    }
  }

  /** Open more: step the primary value up (closed / non-stepping covers open to memory). */
  private _stepOpen(): void {
    if (!this._hasPrimary() || !this._isOpen()) {
      this._openToMemory();
      return;
    }
    this._step(1);
  }

  /** Close more: step the primary value down (non-stepping covers fully close). */
  private _stepClose(): void {
    if (!this._hasPrimary()) {
      this._closeFull();
      return;
    }
    if (!this._isOpen()) return;
    this._step(-1);
  }

  private _step(delta: number): void {
    if (this._canSetPosition()) {
      this._setPosition(stepPct(this._positionAttr() ?? 0, delta));
    } else if (this._canSetTilt()) {
      this._setTilt(stepPct(this._tiltAttr() ?? 0, delta));
    } else if (delta > 0) {
      this._openFull();
    } else {
      this._closeFull();
    }
  }

  /** Fully open (no memory). */
  private _openFull(): void {
    if (this._canSetPosition()) {
      this._setPosition(100);
    } else if (this._supportsTilt() && !this._positionAttr()) {
      this._callCover("open_cover_tilt", {});
    } else {
      this._callCover("open_cover", {});
    }
  }

  /** Fully close. */
  private _closeFull(): void {
    if (this._supportsTilt() && !this._canSetPosition() && this._positionAttr() === undefined) {
      this._callCover("close_cover_tilt", {});
    } else {
      this._callCover("close_cover", {});
    }
  }

  /** Smart toggle: stop while moving, otherwise open (to memory) / close. */
  private _toggle(): void {
    if (this._isMoving()) {
      this._callCover("stop_cover", {});
    } else if (this._isOpen()) {
      this._closeFull();
    } else {
      this._openToMemory();
    }
  }

  /** Open applying the configured position "memory" when set. */
  private _openToMemory(): void {
    if (this._canSetPosition()) {
      const mem = this._memoryPct();
      this._setPosition(mem ?? 100);
    } else if (this._supportsTilt() && this._positionAttr() === undefined) {
      this._callCover("open_cover_tilt", {});
    } else {
      this._callCover("open_cover", {});
    }
  }

  /** Resolve the memory position (1–100) for position-capable covers, or null when unset. */
  private _memoryPct(): number | null {
    if (!this._canSetPosition()) return null;
    const mode = this._config?.memory_mode;
    if (mode === "static") {
      const value = this._config?.memory_value;
      return typeof value === "number" ? this._clampMemory(value) : 100;
    }
    if (mode === "helper") {
      const entity = this._config?.memory_entity;
      const stateObj = entity ? this.hass?.states[entity] : undefined;
      const value = stateObj ? Number(stateObj.state) : NaN;
      return Number.isFinite(value) ? this._clampMemory(value) : null;
    }
    return null;
  }

  private _clampMemory(value: number): number {
    return Math.min(100, Math.max(1, Math.round(value)));
  }

  private _setPosition(pct: number): void {
    const value = clampPct(pct);
    if (value <= 0) {
      this._callCover("close_cover", {});
      return;
    }
    this._callCover("set_cover_position", { position: value });
    this._writeMemoryHelper(value);
  }

  private _setTilt(pct: number): void {
    this._callCover("set_cover_tilt_position", { tilt_position: clampPct(pct) });
  }

  /** When using a memory helper, mirror position changes back into the helper. */
  private _writeMemoryHelper(pct: number): void {
    if (!this.hass || this._config?.memory_mode !== "helper") return;
    const entity = this._config.memory_entity;
    if (!entity) return;
    const domain = entity.split(".")[0];
    if (domain !== "input_number" && domain !== "number") return;
    this.hass.callService(domain, "set_value", { entity_id: entity, value: this._clampMemory(pct) });
  }

  private _callCover(service: string, data: Record<string, unknown>): void {
    if (!this.hass || !this._config) return;
    this.hass.callService("cover", service, { entity_id: this._config.entity, ...data });
  }

  // ---- Pointer / long-press handling ----

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

  private _holdActionFor(region: "up" | "down" | "icon"): CoverAction {
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
      background-color: rgba(0, 0, 0, 0.45);
      box-shadow: 0 1px 0 rgba(200, 200, 200, 0.13);
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
    .position {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 0;
      width: 9px;
      opacity: 0.5;
      background-color: var(--ted-style-surface-2);
      pointer-events: none;
    }
    .position-fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      transition: height 180ms ease, background-color 180ms ease;
    }
    /* Right-edge stripe mirroring the position bar, with up/down chevron hints. */
    .stripe {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 0;
      width: 9px;
      opacity: 0.5;
      background-color: var(--ted-style-surface-2);
      pointer-events: none;
    }
    .stripe-symbol {
      position: absolute;
      right: -3px;
      z-index: 0;
      width: 15px;
      height: 15px;
      fill: var(--ted-style-text);
      opacity: 0.5;
      pointer-events: none;
    }
    .stripe-up {
      top: 25%;
      transform: translateY(-50%);
    }
    .stripe-down {
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
    "ted-cover-card": TedCoverCard;
  }
}
