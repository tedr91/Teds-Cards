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
import type { CardElement, CoverCardConfig, CoverAction } from "./types";

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

/** Resolve a per-element ui_color override. Legacy icon_color stored a
 *  "theme"/"other" mode string — treat those (and blanks) as unset. */
function elementColor(value: string | undefined): string | undefined {
  if (!value || value === "theme" || value === "other" || value === "state" || value === "none") return undefined;
  return cssColor(value);
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
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#cover-card",
  getEntitySuggestion: (_hass, entityId) =>
    entityId.startsWith("cover.")
      ? { config: { type: `custom:${COVER_CARD_TYPE}`, entity: entityId } }
      : null,
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
    if (this._config?.orientation === "horizontal") {
      return {
        columns: 6,
        rows: 1,
        min_columns: 4,
        min_rows: 1,
      };
    }
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
      ? resolveColor(this._config.indicator_color, this._config.indicator_color_custom)
      : "var(--ted-style-muted)";
    const nameColor = isOpen ? elementColor(this._config.name_color) : undefined;
    const iconColor =
      isOpen && this._config.icon_color !== "none"
        ? elementColor(this._config.icon_color) ?? "var(--ted-style-accent)"
        : "var(--ted-style-icon-dim)";
    const stateColor = isOpen ? elementColor(this._config.state_color) : undefined;
    const showHint = this._config.show_hint !== false;
    const bgOpen = cssColor(this._config.background_open);
    const bgClosed = cssColor(this._config.background_closed);
    const horizontal = this._config.orientation === "horizontal";
    const indicatorWidth = typeof this._config.indicator_width === "number" ? this._config.indicator_width : 4;
    const hintWidth = typeof this._config.hint_width === "number" ? this._config.hint_width : 8;
    // In a grid (Sections) view, honor the grid cell sizing. Everywhere else
    // (stacks, masonry, panel), render at the configured fixed size.
    const isGrid = this.layout === "grid";
    const cardWidth = typeof this._config.width === "number" ? this._config.width : horizontal ? 240 : 100;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : horizontal ? 80 : 120;
    const cardStyle: Record<string, string> = {
      "--ted-indicator-width": `${indicatorWidth}px`,
      "--ted-hint-width": `${hintWidth}px`,
    };
    if (isOpen && bgOpen) cardStyle.backgroundColor = bgOpen;
    if (!isOpen && bgClosed) cardStyle.backgroundColor = bgClosed;
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
    // Neumorphic effect: rocker style splits into two paddles (one raised, one
    // pressed, flipping with state); button style is a single raised/pressed tile.
    const neumorphic = this._config.rocker_effect !== false;
    const rockerMode = this._config.rocker !== false;
    const shadow = this._config.shadow !== false; // default true

    // Each element has a fixed home based on its position in the order: 1st →
    // top, 2nd → exact center, 3rd → bottom. Hidden elements leave their home
    // empty, so any visible subset stays positioned by order.
    const showFlags: Record<CardElement, boolean> = { name: showName, icon: showIcon, state: showState };
    const order = this._elementOrder();
    const visible = order.filter((el) => showFlags[el]);
    const slotClass = (el: CardElement): string =>
      (["slot-top", "slot-mid", "slot-bot"] as const)[order.indexOf(el)];
    const tpls: Record<CardElement, TemplateResult> = {
      name: html`<span class=${classMap({ primary: true, [slotClass("name")]: true })} style=${styleMap({ fontSize: `${(14 * nameScale) / 100}px`, ...(nameColor ? { color: nameColor } : {}) })}>${name}</span>`,
      icon: html`<button
        type="button"
        class=${classMap({ "icon-shape": true, [slotClass("icon")]: true })}
        style=${styleMap({ color: iconColor, "--mdc-icon-size": `${(24 * iconScale) / 100}px` })}
        aria-label=${name}
        ?disabled=${isUnavailable}
        @click=${this._onIconClick}
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>`,
      state: html`<div class=${classMap({ info: true, [slotClass("state")]: true })}><span class="secondary" style=${styleMap({ fontSize: `${(12 * stateScale) / 100}px`, ...(stateColor ? { color: stateColor } : {}) })}>${stateLabel}</span></div>`,
    };

    return html`
      <ha-card
        class=${classMap({
          open: isOpen,
          unavailable: isUnavailable,
          horizontal,
          single: this._config.rocker === false,
          "no-shadow": !shadow,
          ...themeClasses,
        })}
        style=${styleMap(cardStyle)}
        @pointerdown=${this._onCardPointerDown}
        @pointerup=${this._onCardPointerUp}
        @pointercancel=${this._onCardPointerUp}
        @pointerleave=${this._onCardPointerUp}
      >
        ${this._config.brushed ? brushedOverlay : nothing}
        ${neumorphic
          ? rockerMode
            ? html`
                <div class="ted-neu top ${isOpen ? "pressed" : "raised"}" aria-hidden="true"></div>
                <div class="ted-neu bottom ${isOpen ? "raised" : "pressed"}" aria-hidden="true"></div>
              `
            : html`<div class="ted-neu full ${isOpen ? "pressed" : "raised"}" aria-hidden="true"></div>`
          : nothing}
        ${this._config.show_indicator !== false
          ? html`<div class="position" aria-hidden="true">
              <div
                class="position-fill"
                style=${styleMap(
                  horizontal
                    ? { width: `${pct}%`, backgroundColor: positionColor }
                    : { height: `${pct}%`, backgroundColor: positionColor },
                )}
              ></div>
            </div>`
          : nothing}
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
        ${rockerMode && !neumorphic
          ? html`<div class="divider" aria-hidden="true"></div>`
          : nothing}
        <div class="content">
          ${visible.map((el) => tpls[el])}
        </div>
        ${this._config.rocker !== false
          ? html`
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
            `
          : html`
              <button
                type="button"
                class="region region-full"
                aria-label=${name}
                ?disabled=${isUnavailable}
                @click=${this._onTopClick}
              ></button>
            `}
      </ha-card>
    `;
  }

  private _formatState(state: string): string {
    if (!state) return "";
    return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");
  }

  /** Resolved name/icon/state order, always containing all three. */
  private _elementOrder(): CardElement[] {
    const valid: CardElement[] = ["name", "icon", "state"];
    const order = this._config?.element_order;
    if (!Array.isArray(order)) return valid;
    const result = order.filter((el): el is CardElement => valid.includes(el as CardElement));
    for (const el of valid) if (!result.includes(el)) result.push(el);
    return result.slice(0, 3);
  }

  private _onTopClick = (): void => {
    if (this._consumeLongPress()) return;
    if (this._topClickTimer !== undefined) {
      window.clearTimeout(this._topClickTimer);
      this._topClickTimer = undefined;
      this._execAction(
        this._rockerEnabled() ? this._action("up_double_tap", "open") : this._action("icon_double_tap", "more_info"),
      );
      return;
    }
    this._topClickTimer = window.setTimeout(() => {
      this._topClickTimer = undefined;
      this._execAction(
        this._rockerEnabled() ? this._action("up_tap", "open_step", "open") : this._action("icon_tap", "toggle"),
      );
    }, DOUBLE_CLICK_MS);
  };

  private _onBottomClick = (): void => {
    if (this._consumeLongPress()) return;
    if (this._bottomClickTimer !== undefined) {
      window.clearTimeout(this._bottomClickTimer);
      this._bottomClickTimer = undefined;
      this._execAction(
        this._rockerEnabled() ? this._action("down_double_tap", "close") : this._action("icon_double_tap", "more_info"),
      );
      return;
    }
    this._bottomClickTimer = window.setTimeout(() => {
      this._bottomClickTimer = undefined;
      this._execAction(
        this._rockerEnabled() ? this._action("down_tap", "close_step", "close") : this._action("icon_tap", "toggle"),
      );
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
      if (el.classList.contains("region-full")) return "icon";
      if (el.classList.contains("region-top")) return "up";
      if (el.classList.contains("region-bottom")) return "down";
      if (el === this) return undefined;
    }
    return undefined;
  }

  private _holdActionFor(region: "up" | "down" | "icon"): CoverAction {
    if (!this._rockerEnabled()) return this._action("icon_hold", "more_info");
    if (region === "up") return this._action("up_hold", "more_info");
    if (region === "down") return this._action("down_hold", "more_info");
    return this._action("icon_hold", "more_info");
  }

  /** When false, the card acts as a single button: every region runs the Icon behavior. */
  private _rockerEnabled(): boolean {
    return this._config?.rocker !== false;
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
    .content {
      position: relative;
      flex: 1 1 0;
      min-height: 0;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    /* Each element has a fixed home based on its order: 1st → top, 2nd → exact
       center, 3rd → bottom. Hidden elements leave their home empty, so any
       subset stays positioned by order. */
    .content .slot-bot {
      margin-top: auto;
    }
    /* The middle (2nd) element is pinned to the exact card center, independent
       of the elements above/below it. */
    .content .slot-mid {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    .content .slot-mid.icon-shape:active {
      transform: translate(-50%, -50%) scale(0.92);
    }
    /* Content elements sit above the indicator/hint bars (icon also above the regions). */
    .content > * {
      position: relative;
      z-index: 1;
      max-width: 100%;
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
    /* Rocker off: a single continuous click surface covering the whole card. */
    .region-full {
      top: 0;
      bottom: 0;
      height: 100%;
    }
    ha-card.single .icon-shape {
      pointer-events: none;
      cursor: default;
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
      position: absolute;
      left: 12px;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      z-index: -2;
      height: 1px;
      /* Engraved/sunken look: a dark groove with a faint highlight just below. */
      background-color: rgba(35, 35, 35, 0.45);
      box-shadow: 0 1px 0 rgba(235, 235, 235, 0.13);
      pointer-events: none;
    }
    .icon-shape {
      position: relative;
      z-index: 4;
      display: inline-flex;
      line-height: 0;
      background: none;
      border: none;
      margin: 0;
      padding: 0;
      cursor: pointer;
      outline: none;
      pointer-events: auto;
      transition: color 180ms ease;
      /* Shadow opacity scales with the icon color's lightness (relative-color), so it
         fades out for dark icon colors instead of looking muddy. Older browsers fall
         back to the plain dark shadow. */
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
      filter: drop-shadow(0 1px 2px hsl(from currentColor 0 0% 0% / max(0, (l - 50) * 0.004)));
      -webkit-tap-highlight-color: transparent;
    }
    ha-card.no-shadow .icon-shape {
      filter: none;
    }
    .icon-shape:focus-visible {
      box-shadow: 0 0 0 2px var(--ted-style-accent);
    }
    .icon-shape:active {
      transform: scale(0.92);
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
      width: var(--ted-indicator-width, 4px);
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
      width: var(--ted-hint-width, 8px);
      opacity: 0.5;
      background-color: var(--ted-style-surface-2);
      pointer-events: none;
    }
    .stripe-symbol {
      position: absolute;
      right: calc(var(--ted-hint-width, 8px) / -2);
      z-index: 0;
      width: calc(var(--ted-hint-width, 8px) * 2);
      height: calc(var(--ted-hint-width, 8px) * 2);
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
    /* ---- Horizontal orientation overrides ---- */
    ha-card.horizontal .content {
      flex-direction: row;
    }
    /* In horizontal mode the homes run left → right: 1st → left, 3rd → right. */
    ha-card.horizontal .content .slot-bot {
      margin-top: 0;
      margin-left: auto;
    }
    ha-card.horizontal .divider {
      left: 50%;
      right: auto;
      top: 12px;
      bottom: 12px;
      width: 1px;
      height: auto;
      transform: translateX(-50%);
      box-shadow: 1px 0 0 rgba(235, 235, 235, 0.13);
    }
    ha-card.horizontal .region {
      top: 0;
      bottom: 0;
      left: auto;
      right: auto;
      height: 100%;
      width: 50%;
    }
    /* Right half = UP, left half = DOWN. */
    ha-card.horizontal .region-top {
      right: 0;
    }
    ha-card.horizontal .region-bottom {
      left: 0;
    }
    ha-card.horizontal .region-full {
      left: 0;
      right: 0;
      width: 100%;
    }
    /* Indicator bar: horizontal across the bottom, fills left → right. */
    ha-card.horizontal .position {
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: auto;
      height: var(--ted-indicator-width, 4px);
    }
    ha-card.horizontal .position-fill {
      top: 0;
      bottom: 0;
      left: 0;
      right: auto;
    }
    /* Hint bar: horizontal across the top; chevrons stay UP (right half) / DOWN (left half). */
    ha-card.horizontal .stripe {
      left: 0;
      right: 0;
      top: 0;
      bottom: auto;
      width: auto;
      height: var(--ted-hint-width, 8px);
    }
    ha-card.horizontal .stripe-symbol {
      top: calc(var(--ted-hint-width, 8px) / 2);
      right: auto;
    }
    ha-card.horizontal .stripe-up {
      right: 25%;
      left: auto;
      transform: translate(50%, -50%);
    }
    ha-card.horizontal .stripe-down {
      left: 25%;
      right: auto;
      transform: translate(-50%, -50%);
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
