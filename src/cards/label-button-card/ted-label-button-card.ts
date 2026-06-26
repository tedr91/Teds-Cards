import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type ActionConfig,
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  computeDomain,
  forwardHaptic,
  handleAction,
  hasAction,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import {
  DEFAULT_LABEL_BUTTON_ICON,
  LABEL_BUTTON_CARD_DESCRIPTION,
  LABEL_BUTTON_CARD_EDITOR_TYPE,
  LABEL_BUTTON_CARD_NAME,
  LABEL_BUTTON_CARD_TYPE,
  entityDefaultButtonAction,
} from "./const";
import type { CardElement, LabelButtonCardConfig } from "./types";

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;

/** Resolve a CSS color from a `ui_color` value (hex/rgb/hsl/var string or theme color name). */
function cssColor(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("var")) {
    return value;
  }
  return `var(--${value}-color, ${value})`;
}

/** Resolve a per-element custom color, ignoring blank/legacy mode tokens. */
function elementColor(value?: string): string | undefined {
  if (!value || value === "theme" || value === "other") return undefined;
  return cssColor(value);
}

/** States Home Assistant treats as "off" (mirrors the frontend's STATES_OFF). */
const STATES_OFF = ["closed", "locked", "off"];

/** States treated as "active/on" for the neumorphic pressed look. */
const ON_STATES = new Set([
  "on",
  "open",
  "unlocked",
  "home",
  "playing",
  "active",
  "heat",
  "cool",
  "auto",
  "heat_cool",
  "cleaning",
  "armed_home",
  "armed_away",
  "armed_night",
]);

/**
 * Toggle an entity the way Home Assistant's built-in cards do.
 *
 * The bundled `custom-card-helpers` `toggleEntity` is outdated — it only special-cases
 * `lock`/`cover`, so toggling a `scene` (or `button`/`input_button`/`valve`) falls through
 * to `<domain>.turn_off`, which doesn't exist (e.g. "Action scene.turn_off not found").
 * This mirrors the current HA frontend `turnOnOffEntity`.
 */
function toggleEntity(hass: HomeAssistant, entityId: string): void {
  const stateObj = hass.states[entityId];
  if (!stateObj) return;

  const turnOn = STATES_OFF.includes(stateObj.state);
  const stateDomain = computeDomain(entityId);
  const serviceDomain = stateDomain === "group" ? "homeassistant" : stateDomain;

  let service: string;
  switch (stateDomain) {
    case "lock":
      service = turnOn ? "unlock" : "lock";
      break;
    case "cover":
      service = turnOn ? "open_cover" : "close_cover";
      break;
    case "button":
    case "input_button":
      service = "press";
      break;
    case "scene":
      service = "turn_on";
      break;
    case "valve":
      service = turnOn ? "open_valve" : "close_valve";
      break;
    default:
      service = turnOn ? "turn_on" : "turn_off";
  }

  hass.callService(serviceDomain, service, { entity_id: entityId });
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
  type: LABEL_BUTTON_CARD_TYPE,
  name: LABEL_BUTTON_CARD_NAME,
  description: LABEL_BUTTON_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#label--button-card",
  getEntitySuggestion: (_hass, entityId) => ({
    config: { type: `custom:${LABEL_BUTTON_CARD_TYPE}`, entity: entityId },
  }),
});

@customElement(LABEL_BUTTON_CARD_TYPE)
export class TedLabelButtonCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-label-button-card-editor");
    return document.createElement(LABEL_BUTTON_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<LabelButtonCardConfig, "type"> {
    return { name: "Button" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: LabelButtonCardConfig;

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;

  public setConfig(config: LabelButtonCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
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
      min_columns: 2,
      min_rows: 1,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config") || changed.has("layout")) return true;
    if (!changed.has("hass")) return false;
    const entity = this._config.entity;
    if (!entity) return false;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    return oldHass.states[entity] !== this.hass?.states[entity];
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._clickTimer !== undefined) window.clearTimeout(this._clickTimer);
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
  }

  private _stateObj() {
    const entity = this._config?.entity;
    return entity ? this.hass?.states[entity] : undefined;
  }

  private _name(): string {
    const stateObj = this._stateObj();
    return this._config?.name ?? stateObj?.attributes?.friendly_name ?? this._config?.entity ?? "";
  }

  private _icon(): string {
    const stateObj = this._stateObj();
    return this._config?.icon ?? stateObj?.attributes?.icon ?? DEFAULT_LABEL_BUTTON_ICON;
  }

  private _stateLabel(): string {
    const stateObj = this._stateObj();
    if (!stateObj) return "";
    const unit = stateObj.attributes?.unit_of_measurement;
    const value = stateObj.state.charAt(0).toUpperCase() + stateObj.state.slice(1).replace(/_/g, " ");
    return unit ? `${stateObj.state} ${unit}` : value;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const theme = this._config.theme === "ha" ? "ha" : "ted-style";
    const brushed = this._config.brushed === true;
    const showIcon = this._config.show_icon !== false;
    const showName = this._config.show_name !== false;
    const showState = this._config.show_state === true && !!this._stateObj();
    const iconScale = typeof this._config.icon_scale === "number" ? this._config.icon_scale : 100;
    const nameScale = typeof this._config.name_scale === "number" ? this._config.name_scale : 100;
    const stateScale = typeof this._config.state_scale === "number" ? this._config.state_scale : 100;
    // Neumorphic effect: a single raised tile (off/idle) that presses in when the
    // bound entity is active. On by default.
    const neumorphic = this._config.neumorphic !== false;
    const shadow = this._config.shadow !== false; // default true
    const stateObj = this._stateObj();
    const isActive = !!stateObj && ON_STATES.has(String(stateObj.state).toLowerCase());

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      clickable: this._hasInteractions(),
      "no-shadow": !shadow,
    };

    const cardStyle: Record<string, string> = {};
    const bg = cssColor(this._config.background);
    if (bg) cardStyle.background = bg;

    // Dim the icon (and drop custom colors) for a bound entity that's inactive,
    // matching Home Assistant's built-in button card. Label-only buttons (no entity)
    // always show their configured colors.
    const dim = !!stateObj && !isActive;
    const nameColor = dim ? undefined : elementColor(this._config.name_color);
    const stateColor = dim ? undefined : elementColor(this._config.state_color);
    const iconColor = dim
      ? "var(--ted-style-icon-dim)"
      : elementColor(this._config.icon_color) ?? "var(--ted-style-accent)";

    // Each element has a fixed home based on its position in the order: 1st →
    // top, 2nd → exact center, 3rd → bottom. Hidden elements leave their home
    // empty, so any visible subset stays positioned by order.
    const showFlags: Record<CardElement, boolean> = { name: showName, icon: showIcon, state: showState };
    const order = this._elementOrder();
    const visible = order.filter((el) => showFlags[el]);
    const slotClass = (el: CardElement): string =>
      (["slot-top", "slot-mid", "slot-bot"] as const)[order.indexOf(el)];
    const tpls: Record<CardElement, TemplateResult> = {
      name: html`<span class=${classMap({ name: true, [slotClass("name")]: true })} style=${styleMap({ fontSize: `${(16 * nameScale) / 100}px`, ...(nameColor ? { color: nameColor } : {}) })}>${this._name()}</span>`,
      icon: html`<ha-icon class=${classMap({ icon: true, [slotClass("icon")]: true })} style=${styleMap({ color: iconColor, "--mdc-icon-size": `${(32 * iconScale) / 100}px` })} .icon=${this._icon()}></ha-icon>`,
      state: html`<span class=${classMap({ state: true, [slotClass("state")]: true })} style=${styleMap({ fontSize: `${(13.6 * stateScale) / 100}px`, ...(stateColor ? { color: stateColor } : {}) })}>${this._stateLabel()}</span>`,
    };

    return html`
      <ha-card
        class=${classMap(cardClasses)}
        style=${styleMap(cardStyle)}
        @click=${this._onClick}
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
      >
        ${brushed ? brushedOverlay : nothing}
        ${neumorphic
          ? html`<div class="ted-neu full ${isActive ? "pressed" : "raised"}" aria-hidden="true"></div>`
          : nothing}
        <div class="lbc">${visible.map((el) => tpls[el])}</div>
      </ha-card>
    `;
  }

  /** The element layout order (default: icon, name, state). Unknown/missing
   *  elements are dropped/appended so the list is always the full set of three. */
  private _elementOrder(): CardElement[] {
    const valid: CardElement[] = ["icon", "name", "state"];
    const order = this._config?.element_order;
    if (!Array.isArray(order)) return valid;
    const result = order.filter((el): el is CardElement => valid.includes(el as CardElement));
    for (const el of valid) if (!result.includes(el)) result.push(el);
    return result.slice(0, 3);
  }

  private _onClick = (): void => {
    // Behave as a static header/label unless an interaction is configured.
    if (!this._hasInteractions()) return;
    if (this._longPressFired) {
      this._longPressFired = false;
      return;
    }
    if (this._clickTimer !== undefined) {
      window.clearTimeout(this._clickTimer);
      this._clickTimer = undefined;
      this._dispatch("double_tap");
      return;
    }
    this._clickTimer = window.setTimeout(() => {
      this._clickTimer = undefined;
      this._dispatch("tap");
    }, DOUBLE_CLICK_MS);
  };

  private _onPointerDown = (): void => {
    this._longPressFired = false;
    if (!this._hasInteractions()) return;
    if (!hasAction(this._config?.hold_action)) return;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._dispatch("hold");
    }, LONG_PRESS_MS);
  };

  private _onPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  /** True when a tap/hold/double-tap action will run (card acts as a button). A tap
   *  with no explicit action still counts when the entity has a default action. */
  private _hasInteractions(): boolean {
    const config = this._config;
    if (!config) return false;
    return (
      hasAction(this._tapActionConfig()) ||
      hasAction(config.hold_action) ||
      hasAction(config.double_tap_action)
    );
  }

  /** The tap action that will run: the explicit `tap_action`, or — when none is set
   *  — the entity's default button action (toggle for toggleable domains, else
   *  more-info), matching Home Assistant's built-in button card. */
  private _tapActionConfig(): ActionConfig {
    return (
      this._config?.tap_action ??
      ({ action: entityDefaultButtonAction(this._config?.entity) } as ActionConfig)
    );
  }

  /** Run a configured action. Hold/double only fire when configured; a tap with no
   *  explicit action falls back to the entity's default button action (toggle for
   *  toggleable domains, otherwise more-info), matching HA's built-in button card. */
  private _dispatch(action: "tap" | "hold" | "double_tap"): void {
    if (!this.hass || !this._config) return;
    if (action === "hold" && !hasAction(this._config.hold_action)) return;
    if (action === "double_tap" && !hasAction(this._config.double_tap_action)) return;

    // `custom-card-helpers`' bundled `toggle` handler calls `<domain>.turn_off` for
    // scenes/buttons/valves/etc., which fails (e.g. "scene.turn_off not found"). Handle
    // `toggle` ourselves to match HA's built-in button card; delegate everything else.
    const actionConfig =
      action === "tap"
        ? this._tapActionConfig()
        : action === "hold"
          ? this._config.hold_action
          : this._config.double_tap_action;

    if (actionConfig?.action === "toggle" && this._config.entity) {
      if (!this._confirmAction(actionConfig)) return;
      toggleEntity(this.hass, this._config.entity);
      forwardHaptic("success");
      return;
    }

    handleAction(this, this.hass, this._config, action);
  }

  /** Mirror custom-card-helpers' confirmation gate so toggle confirmations still work. */
  private _confirmAction(actionConfig: ActionConfig): boolean {
    const confirmation = actionConfig.confirmation;
    if (
      confirmation &&
      (!confirmation.exemptions ||
        !confirmation.exemptions.some((e) => e.user === this.hass!.user?.id))
    ) {
      forwardHaptic("warning");
      return window.confirm(
        confirmation.text || `Are you sure you want to ${actionConfig.action}?`,
      );
    }
    return true;
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
        overflow: hidden;
        height: 100%;
      }

      ha-card.clickable {
        cursor: pointer;
        transition: filter 120ms ease, transform 80ms ease;
      }

      @media (hover: hover) {
        ha-card.clickable:hover {
          filter: brightness(1.06);
        }
      }

      ha-card.clickable:active {
        transform: scale(0.97);
      }

      .lbc {
        position: relative;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        height: 100%;
        min-height: 64px;
        padding: 12px;
        text-align: center;
        color: var(--ted-style-text);
      }

      /* Each element has a fixed home based on its order: 1st → top, 2nd →
         exact center, 3rd → bottom. Hidden elements leave their home empty,
         so any visible subset stays positioned by order. */
      .lbc .slot-bot {
        margin-top: auto;
      }
      .lbc .slot-mid {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .icon {
        --mdc-icon-size: 32px;
        color: var(--ted-style-accent);
        /* Shadow opacity scales with the icon color's lightness (relative-color), so it
           fades out for dark icon colors instead of looking muddy. Older browsers fall
           back to the plain dark shadow. */
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
        filter: drop-shadow(0 1px 2px hsl(from currentColor 0 0% 0% / max(0, (l - 50) * 0.004)));
      }

      ha-card.no-shadow .icon {
        filter: none;
      }

      .name {
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .state {
        font-size: 0.85rem;
        line-height: 1.1;
        color: var(--ted-style-muted);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-label-button-card": TedLabelButtonCard;
  }
}
