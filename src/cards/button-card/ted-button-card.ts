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
import { appearanceStyle } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { viewAssistNavigate, viewAssistToggleHold } from "../../shared/view-assist";
import {
  BUTTON_CARD_DESCRIPTION,
  BUTTON_CARD_EDITOR_TYPE,
  BUTTON_CARD_NAME,
  BUTTON_CARD_TYPE,
  DEFAULT_BUTTON_ICON,
  entityDefaultButtonAction,
} from "./const";
import type {
  ButtonCardConfig,
  CardElement,
  HighlightConfig,
  HighlightRule,
  ViewAssistNavigateActionConfig,
} from "./types";

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
  if (!value || value === "theme" || value === "other" || value === "state" || value === "none") return undefined;
  return cssColor(value);
}

/** Whether a single dynamic-highlight rule matches the highlight entity's state. */
function highlightRuleMatches(rule: HighlightRule, raw: string, num: number): boolean {
  const op = rule.operator ?? "is";
  const value = rule.value;
  if (value == null || value === "") return false;
  if (op === "is") return raw === String(value);
  if (op === "is_not") return raw !== String(value);
  const target = Number(value);
  if (!Number.isFinite(num) || !Number.isFinite(target)) return false;
  switch (op) {
    case ">":
      return num > target;
    case ">=":
      return num >= target;
    case "<":
      return num < target;
    case "<=":
      return num <= target;
    default:
      return false;
  }
}

/**
 * Evaluate dynamic-highlight rules against the configured entity's state and return
 * the resulting background / icon color overrides. Rules are processed top→bottom;
 * each match applies its colors (a later match overrides an earlier one) and a
 * matching rule with `halt` stops further processing (first-match-wins ladders).
 */
function evalHighlight(
  hass: HomeAssistant,
  highlight?: HighlightConfig,
): { background?: string; icon?: string } {
  const result: { background?: string; icon?: string } = {};
  const entity = highlight?.entity;
  const rules = highlight?.rules;
  if (!entity || !Array.isArray(rules) || rules.length === 0) return result;
  const stateObj = hass.states[entity];
  if (!stateObj) return result;
  const raw = stateObj.state;
  const num = Number(raw);
  for (const rule of rules) {
    if (!highlightRuleMatches(rule, raw, num)) continue;
    if (rule.background_color) result.background = cssColor(rule.background_color);
    if (rule.icon_color) result.icon = cssColor(rule.icon_color);
    if (rule.halt) break;
  }
  return result;
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
  type: BUTTON_CARD_TYPE,
  name: BUTTON_CARD_NAME,
  description: BUTTON_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#button-card",
  getEntitySuggestion: (_hass, entityId) => ({
    config: { type: `custom:${BUTTON_CARD_TYPE}`, entity: entityId },
  }),
});

@customElement(BUTTON_CARD_TYPE)
export class TedButtonCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-button-card-editor");
    return document.createElement(BUTTON_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<ButtonCardConfig, "type"> {
    return { name: "Button" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ButtonCardConfig;

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;
  private _resizeObserver?: ResizeObserver;

  public setConfig(config: ButtonCardConfig): void {
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
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    // Re-render when any entity this card depends on changes: the bound entity,
    // the badge entity, or the dynamic-highlight entity.
    const deps = this._dependentEntities();
    if (deps.length === 0) return false;
    return deps.some((entity) => oldHass.states[entity] !== this.hass?.states[entity]);
  }

  /** Entities whose state this card reacts to (bound entity + badge + highlight). */
  private _dependentEntities(): string[] {
    const deps = new Set<string>();
    if (this._config?.entity) deps.add(this._config.entity);
    if (this._config?.badge?.entity) deps.add(this._config.badge.entity);
    if (this._config?.highlight?.entity) deps.add(this._config.highlight.entity);
    return [...deps];
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._resizeObserver ??= new ResizeObserver(() => this._measureIconBase());
    this._resizeObserver.observe(this);
    this._measureIconBase();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._clickTimer !== undefined) window.clearTimeout(this._clickTimer);
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._resizeObserver?.disconnect();
  }

  /** Base (100%) icon size scales with the card's smaller dimension, calibrated so
   *  a ~64px card keeps the historical 32px base. Exposed as `--lbc-icon-base`. */
  private _measureIconBase(): void {
    const rect = this.getBoundingClientRect();
    const min = Math.min(rect.width, rect.height);
    if (min <= 0) return;
    const base = Math.max(12, Math.min(88, min * 0.5));
    this.style.setProperty("--lbc-icon-base", `${base}px`);
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
    return this._config?.icon ?? stateObj?.attributes?.icon ?? DEFAULT_BUTTON_ICON;
  }

  private _stateLabel(): string {
    const stateObj = this._stateObj();
    if (!stateObj) return "";
    const unit = stateObj.attributes?.unit_of_measurement;
    const value = stateObj.state.charAt(0).toUpperCase() + stateObj.state.slice(1).replace(/_/g, " ");
    return unit ? `${stateObj.state} ${unit}` : value;
  }

  /** Text for the badge overlay (a number from the badge entity), or undefined to hide it. */
  private _badgeText(): string | undefined {
    const badge = this._config?.badge;
    const entity = badge?.entity;
    if (!entity) return undefined;
    const stateObj = this.hass?.states[entity];
    if (!stateObj) return undefined;
    const raw = stateObj.state;
    if (raw === "" || raw === "unavailable" || raw === "unknown" || raw === "none") return undefined;
    const num = Number(raw);
    const isZero = Number.isFinite(num) ? num === 0 : raw === "0";
    if (isZero && !badge.show_when_zero) return undefined;
    if (Number.isFinite(num)) return num > 99 ? "99+" : String(num);
    return raw;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const theme = this._config.theme === "ted-style" ? "ted-style" : "ha";
    const brushed = this._config.brushed === true;
    const showIcon = this._config.show_icon !== false;
    const showName = this._config.show_name === true;
    const showState = this._config.show_state === true && !!this._stateObj();
    const iconScale = typeof this._config.icon_scale === "number" ? this._config.icon_scale : 100;
    const nameScale = typeof this._config.name_scale === "number" ? this._config.name_scale : 100;
    const stateScale = typeof this._config.state_scale === "number" ? this._config.state_scale : 100;
    // Neumorphic effect: a single raised tile (off/idle) that presses in when the
    // bound entity is active. Off by default.
    const neumorphic = this._config.neumorphic === true;
    const shadow = this._config.shadow !== false; // default true
    const stateObj = this._stateObj();
    const isActive = !!stateObj && ON_STATES.has(String(stateObj.state).toLowerCase());

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      clickable: this._hasInteractions(),
      "no-shadow": !shadow,
      grid: this.layout === "grid",
    };

    const bgBase = cssColor(this._config.background);
    const bgActive = cssColor(this._config.background_on);
    const cardStyle: Record<string, string> = appearanceStyle({
      background: isActive ? bgActive ?? bgBase : bgBase,
      transparency: this._config.transparency,
      blur: this._config.blur,
    });

    // Dynamic highlighting: an independent entity drives background / icon color
    // overrides via ordered rules, applied on top of the configured colors and
    // regardless of the bound entity's active state.
    const highlight = evalHighlight(this.hass, this._config.highlight);
    if (highlight.background) cardStyle.background = highlight.background;

    // In a grid (Sections) view, honor the grid cell sizing. Everywhere else
    // (stacks, masonry, panel), render at the configured fixed size.
    const isGrid = this.layout === "grid";
    if (!isGrid) {
      const cardWidth = typeof this._config.width === "number" ? this._config.width : 100;
      const cardHeight = typeof this._config.height === "number" ? this._config.height : 120;
      cardStyle.width = `${cardWidth}px`;
      cardStyle.height = `${cardHeight}px`;
      cardStyle.margin = "0 auto";
    }

    // Dim the icon (and drop custom colors) for a bound entity that's inactive,
    // matching Home Assistant's built-in button card. Label-only buttons (no entity)
    // always show their configured colors.
    const dim = !!stateObj && !isActive;
    const nameColor = dim ? undefined : elementColor(this._config.name_color);
    const stateColor = dim ? undefined : elementColor(this._config.state_color);
    const iconColor =
      highlight.icon ??
      (dim || this._config.icon_color === "none"
        ? "var(--ted-style-icon-dim)"
        : elementColor(this._config.icon_color) ?? "var(--ted-style-accent)");

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
      icon: html`<ha-icon class=${classMap({ icon: true, [slotClass("icon")]: true })} style=${styleMap({ color: iconColor, "--mdc-icon-size": `calc(var(--lbc-icon-base, 32px) * ${iconScale} / 100)` })} .icon=${this._icon()}></ha-icon>`,
      state: html`<span class=${classMap({ state: true, [slotClass("state")]: true })} style=${styleMap({ fontSize: `${(13.6 * stateScale) / 100}px`, ...(stateColor ? { color: stateColor } : {}) })}>${this._stateLabel()}</span>`,
    };

    const badgeText = this._badgeText();
    const badgeStyle: Record<string, string> = {};
    const badgeBg = cssColor(this._config.badge?.color);
    if (badgeBg) badgeStyle.background = badgeBg;
    const badgeFg = cssColor(this._config.badge?.text_color);
    if (badgeFg) badgeStyle.color = badgeFg;

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
        ${badgeText !== undefined
          ? html`<div class="lbc-badge" style=${styleMap(badgeStyle)}>${badgeText}</div>`
          : nothing}
      </ha-card>
    `;
  }

  /** The element layout order (default: icon, name, state). Unknown/missing
   *  elements are dropped/appended so the list is always the full set of three. */
  private _elementOrder(): CardElement[] {
    const valid: CardElement[] = ["name", "icon", "state"];
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

    // View Assist navigation: resolve the destination through the integration so it
    // follows the device's configured screens. Opt-in via `view-assist-navigate`; any
    // other action falls through to Home Assistant's standard handler untouched.
    if (actionConfig && (actionConfig.action as string) === "view-assist-navigate") {
      if (!this._confirmAction(actionConfig)) return;
      this._vaNavigate((actionConfig as unknown as ViewAssistNavigateActionConfig).view);
      forwardHaptic("success");
      return;
    }

    // View Assist hold: toggle the device's hold mode (pause auto-revert). Opt-in.
    if (actionConfig && (actionConfig.action as string) === "view-assist-hold") {
      if (!this._confirmAction(actionConfig)) return;
      viewAssistToggleHold(this.hass);
      forwardHaptic("success");
      return;
    }

    handleAction(this, this.hass, this._config, action);
  }

  /** Navigate via the View Assist integration so the destination honours the device's
   *  configured screens (see shared/view-assist). Only ever invoked from a user tap —
   *  never at load or render — so non-View-Assist cards are entirely unaffected. */
  private _vaNavigate(view: string): void {
    viewAssistNavigate(this.hass, view);
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

      /* In a grid / fixed cell the surrounding card sets the height, so drop the
         standalone minimum — a small embedded button (e.g. in the navbar) then
         fills its cell and the centered element stays vertically centered. */
      ha-card.grid .lbc {
        min-height: 0;
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
      /* A centered icon composes the centering translate with the optional rotation, so
         an embedding card's --ted-icon-rotate still flips it (the plain .icon transform
         below would otherwise be overridden by .slot-mid's translate). */
      .lbc .slot-mid.icon {
        transform: translate(-50%, -50%) rotate(var(--ted-icon-rotate, 0deg));
      }

      .icon {
        --mdc-icon-size: 32px;
        color: var(--ted-style-accent);
        /* Optional rotation driven by an inherited custom property (default none). An
           embedding card (e.g. the Expandable Button Card) can set --ted-icon-rotate to
           flip the icon — the property inherits through the shadow boundary. */
        transform: rotate(var(--ted-icon-rotate, 0deg));
        transition: transform 0.2s ease;
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

      .lbc-badge {
        position: absolute;
        top: var(--lbc-badge-inset, 6px);
        right: var(--lbc-badge-inset, 6px);
        z-index: 2;
        box-sizing: border-box;
        min-width: var(--lbc-badge-size, 18px);
        height: var(--lbc-badge-size, 18px);
        padding: 0 0.36em;
        border-radius: 999px;
        background: #f44336;
        color: #fff;
        font-size: var(--lbc-badge-font, 11px);
        font-weight: 700;
        line-height: var(--lbc-badge-size, 18px);
        text-align: center;
        pointer-events: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-button-card": TedButtonCard;
  }
}
