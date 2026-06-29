import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** The three reorderable content elements. */
export type CardElement = "name" | "icon" | "state";

/** Comparison operator for a dynamic-highlight rule. */
export type HighlightOperator = "is" | "is_not" | ">" | ">=" | "<" | "<=";

/** A single dynamic-highlight rule. When the highlight entity's state satisfies the
 *  operator/value test, the rule's colors are applied. */
export interface HighlightRule {
  operator?: HighlightOperator;
  value?: string | number;
  background_color?: string;
  icon_color?: string;
  /** Stop evaluating further rules once this one matches. */
  halt?: boolean;
}

/** Dynamic highlighting: recolor the button based on an entity's state. */
export interface HighlightConfig {
  entity?: string;
  rules?: HighlightRule[];
}

/** A small numeric badge driven by an entity's state. */
export interface BadgeConfig {
  entity?: string;
  color?: string;
  text_color?: string;
  /** Show the badge even when the value is zero. Defaults to false. */
  show_when_zero?: boolean;
}

/** Navigate using the View Assist integration's `view_assist.navigate` service so the
 *  destination honours the device's configured screens. `view` is the logical name
 *  `home` (resolved by the integration to the device's configured Home screen) or a
 *  view slug such as `music` (navigated relative to the device's configured dashboard).
 *  On a non-View-Assist browser the card falls back to a normal dashboard navigation.
 *  Configure in YAML, e.g. `tap_action: { action: view-assist-navigate, view: home }`. */
export interface ViewAssistNavigateActionConfig {
  action: "view-assist-navigate";
  view: string;
}

export interface LabelButtonCardConfig extends LovelaceCardConfig {
  type: string;
  entity?: string;
  name?: string;
  icon?: string;

  // Visual
  theme?: TedStyleTheme;
  icon_color?: string;
  name_color?: string;
  state_color?: string;
  background?: string;
  /** Card background color when the entity is on/active (overrides the base). */
  background_on?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  /** Neumorphic effect: raised tile when off/idle, pressed when the entity is active. Defaults to true. */
  neumorphic?: boolean;
  show_icon?: boolean;
  icon_scale?: number;
  show_name?: boolean;
  name_scale?: number;
  show_state?: boolean;
  state_scale?: number;
  /** Order the name / icon / state stack is laid out in. Defaults to icon, name, state. */
  element_order?: CardElement[];

  // Badge + dynamic highlighting
  badge?: BadgeConfig;
  highlight?: HighlightConfig;

  // Interactions
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
