import { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type CoverCardTheme = TedStyleTheme;

/** Source for the indicator bar and icon colors. */
export type CoverColorMode = "theme" | "other";

/** An action that can be bound to a tap / double-tap / long-press on a region. */
export type CoverAction =
  | "open_step"
  | "close_step"
  | "open"
  | "close"
  | "toggle"
  | "stop"
  | "tilt_open"
  | "tilt_close"
  | "more_info"
  | "none";

/** Position "memory" source used when the card opens a position-capable cover. */
export type MemoryMode = "off" | "static" | "helper";

export interface CoverCardConfig extends LovelaceCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  icon_open?: string;
  width?: number;
  height?: number;
  theme?: CoverCardTheme;
  orientation?: "vertical" | "horizontal";
  indicator_color?: CoverColorMode;
  indicator_color_custom?: number[];
  indicator_width?: number;
  show_indicator?: boolean;
  icon_color?: CoverColorMode;
  icon_color_custom?: number[];
  background_open?: string;
  brushed?: boolean;
  rocker?: boolean;
  rocker_effect?: boolean;
  show_name?: boolean;
  name_scale?: number;
  show_icon?: boolean;
  icon_scale?: number;
  show_state?: boolean;
  state_scale?: number;
  show_hint?: boolean;
  hint_width?: number;
  // Switch behavior: action bound to each region × gesture.
  up_tap?: CoverAction;
  up_double_tap?: CoverAction;
  up_hold?: CoverAction;
  down_tap?: CoverAction;
  down_double_tap?: CoverAction;
  down_hold?: CoverAction;
  icon_tap?: CoverAction;
  icon_double_tap?: CoverAction;
  icon_hold?: CoverAction;
  // Position memory (position-capable covers).
  memory_mode?: MemoryMode;
  memory_value?: number;
  memory_entity?: string;
}
