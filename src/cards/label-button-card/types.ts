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
  show_icon?: boolean;
  show_name?: boolean;
  show_state?: boolean;

  // Interactions
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
