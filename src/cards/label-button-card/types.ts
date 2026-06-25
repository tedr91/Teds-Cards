import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

export interface LabelButtonCardConfig extends LovelaceCardConfig {
  type: string;
  entity?: string;
  name?: string;
  icon?: string;

  // Visual
  theme?: TedStyleTheme;
  icon_color?: string;
  background?: string;
  brushed?: boolean;
  /** Neumorphic effect: raised tile when off/idle, pressed when the entity is active. Defaults to true. */
  neumorphic?: boolean;
  show_icon?: boolean;
  icon_scale?: number;
  show_name?: boolean;
  name_scale?: number;
  show_state?: boolean;
  state_scale?: number;

  // Interactions
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
