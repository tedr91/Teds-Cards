import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";
import type { IconSpec } from "../../shared/icons";

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
  /** Count entries in this list attribute of the entity instead of using its state. */
  count_attribute?: string;
  /** Only count entries whose `location` matches this device's area (plus house-wide). */
  area_scoped?: boolean;
}

/** A small numeric badge driven by an entity's state. */
export interface BadgeConfig {
  entity?: string;
  color?: string;
  text_color?: string;
  /** Show the badge even when the value is zero. Defaults to false. */
  show_when_zero?: boolean;
  /** Count entries in this list attribute of the entity instead of using its state. */
  count_attribute?: string;
  /** Only count entries whose `location` matches this device's area (plus house-wide). */
  area_scoped?: boolean;
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

/** Toggle View Assist "hold" mode (pause the auto-revert timeout) on the current
 *  device. Configure in YAML: `tap_action: { action: view-assist-hold }`. */
export interface ViewAssistHoldActionConfig {
  action: "view-assist-hold";
}

/** Navigate to a Ted's Cards dashboard-path setting resolved at tap time (so it
 *  follows the configured root + per-device override). Configure in YAML:
 *  `tap_action: { action: navigate-dashboard, dashboard: home_dashboard }`. */
export interface NavigateDashboardActionConfig {
  action: "navigate-dashboard";
  /** Settings key, e.g. `home_dashboard`, `calendar_dashboard`, `weather_dashboard`. */
  dashboard: string;
}

export interface ButtonCardConfig extends LovelaceCardConfig {
  type: string;
  entity?: string;
  name?: string;
  /** An icon string (`mdi:bed`) OR a per-set fallback map (`{ streamline-ultimate-color: …, mdi: bed }`),
   *  resolved to the first installed set in priority order — see `shared/icons.ts`. */
  icon?: IconSpec;

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
  /** Neumorphic effect: raised tile when off/idle, pressed when the entity is active. Defaults to false. */
  neumorphic?: boolean;
  show_icon?: boolean;
  icon_scale?: number;
  show_name?: boolean;
  name_scale?: number;
  show_state?: boolean;
  state_scale?: number;
  /** Order the name / icon / state stack is laid out in. Defaults to icon, name, state. */
  element_order?: CardElement[];
  /** Layout direction of the icon / name / state elements. Defaults to `vertical`. */
  orientation?: "vertical" | "horizontal";
  /** Fixed width (px) when the card isn't a direct item in a grid (Sections) view. Defaults to 100. */
  width?: number;
  /** Fixed height (px) when the card isn't a direct item in a grid (Sections) view. Defaults to 120. */
  height?: number;

  // Badge + dynamic highlighting
  badge?: BadgeConfig;
  highlight?: HighlightConfig;

  // Interactions
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
