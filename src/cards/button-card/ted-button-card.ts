import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type ActionConfig,
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  hasAction,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { appearanceStyle } from "../../shared/appearance";
import { resolveDeviceArea } from "../../shared/device-area";
import { resolveIcon } from "../../shared/icons";
import { runTedAction } from "../../shared/actions";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
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
  valueOverride?: number,
): { background?: string; icon?: string } {
  const result: { background?: string; icon?: string } = {};
  const entity = highlight?.entity;
  const rules = highlight?.rules;
  if (!entity || !Array.isArray(rules) || rules.length === 0) return result;
  let raw: string;
  let num: number;
  if (valueOverride !== undefined) {
    num = valueOverride;
    raw = String(valueOverride);
  } else {
    const stateObj = hass.states[entity];
    if (!stateObj) return result;
    raw = stateObj.state;
    num = Number(raw);
  }
  for (const rule of rules) {
    if (!highlightRuleMatches(rule, raw, num)) continue;
    if (rule.background_color) result.background = cssColor(rule.background_color);
    if (rule.icon_color) result.icon = cssColor(rule.icon_color);
    if (rule.halt) break;
  }
  return result;
}

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
  documentationURL: "https://github.com/tedr91/Teds-Cards#button-card",
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
    return resolveIcon(this._config?.icon) ?? stateObj?.attributes?.icon ?? DEFAULT_BUTTON_ICON;
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
    const scoped = this._scopedCount(badge);
    let num: number;
    let raw: string;
    if (scoped !== undefined) {
      num = scoped;
      raw = String(scoped);
    } else {
      const stateObj = this.hass?.states[entity];
      if (!stateObj) return undefined;
      raw = stateObj.state;
      if (raw === "" || raw === "unavailable" || raw === "unknown" || raw === "none") return undefined;
      num = Number(raw);
    }
    const isZero = Number.isFinite(num) ? num === 0 : raw === "0";
    if (isZero && !badge.show_when_zero) return undefined;
    if (Number.isFinite(num)) return num > 99 ? "99+" : String(num);
    return raw;
  }

  /**
   * Area-scoped count for a badge/highlight configured with `count_attribute`:
   * counts entries in that list attribute, optionally filtered to this device's
   * area (plus house-wide, area-less entries). Entries carrying an `enabled` flag
   * (alarms) are only counted when enabled, matching the sensor's own state.
   * Returns undefined when not configured for counting (falls back to state).
   */
  private _scopedCount(cfg?: {
    entity?: string;
    count_attribute?: string;
    area_scoped?: boolean;
  }): number | undefined {
    if (!cfg?.entity || !cfg.count_attribute) return undefined;
    const list = this.hass?.states[cfg.entity]?.attributes?.[cfg.count_attribute];
    if (!Array.isArray(list)) return undefined;
    const area = cfg.area_scoped ? resolveDeviceArea(this.hass, undefined).area : undefined;
    let items = list as Array<{ location?: string | null; enabled?: boolean }>;
    // Only scope when an area actually resolves; if the device's area is unknown,
    // count everything (mirrors the notification behaviour) instead of hiding all
    // room-scoped items — otherwise the badge/highlight would never show.
    if (area) {
      items = items.filter((it) => !it.location || it.location === area);
    }
    items = items.filter((it) => it.enabled === undefined || it.enabled);
    return items.length;
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
    const highlight = evalHighlight(this.hass, this._config.highlight, this._scopedCount(this._config.highlight));
    if (highlight.background) cardStyle.background = highlight.background;

    // Optional colored ring (outline + soft glow) — used to mark an active/selected button.
    const ringC = cssColor(this._config.ring);
    if (ringC) {
      cardStyle["box-shadow"] =
        `0 0 0 2px ${ringC}, 0 0 6px color-mix(in srgb, ${ringC} 35%, transparent)`;
    }

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

    const horizontal = this._config.orientation === "horizontal";

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
        <div class=${classMap({ lbc: true, horizontal })}>${visible.map((el) => tpls[el])}</div>
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
    runTedAction(this, this.hass, this._config, action, {
      defaultAction: entityDefaultButtonAction(this._config.entity),
    });
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

      /* Horizontal orientation: the SAME 1st/2nd/3rd → start / exact-center / end slot
         logic as the vertical layout, but along the ROW axis (left / center / right),
         with every element vertically centered. The middle slot keeps the shared
         absolute both-axis centering; the ends are pushed out with auto margins. Drop the
         vertical stack's min-height so a short horizontal button centers within its height. */
      .lbc.horizontal {
        flex-direction: row;
        align-items: center;
        min-height: 0;
      }
      .lbc.horizontal .slot-top {
        margin: 0 auto 0 0;
      }
      .lbc.horizontal .slot-bot {
        margin: 0 0 0 auto;
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
