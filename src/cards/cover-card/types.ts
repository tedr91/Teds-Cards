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

/** A reorderable visual element of the card body. */
export type CardElement = "name" | "icon" | "state";

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
  /** Per-element colors applied when the cover is open (blank = default). */
  name_color?: string;
  icon_color?: string;
  state_color?: string;
  /** Card background color (base; applies in all states). */
  background?: string;
  /** Card background color when the cover is open (overrides the base). */
  background_open?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  rocker?: boolean;
  rocker_effect?: boolean;
  show_name?: boolean;
  name_scale?: number;
  show_icon?: boolean;
  icon_scale?: number;
  show_state?: boolean;
  state_scale?: number;
  /** Stacking order of the name / icon / state elements. Defaults to name, icon, state. */
  element_order?: CardElement[];
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
