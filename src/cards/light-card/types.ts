import { LovelaceCardConfig } from "custom-card-helpers";

/** Visual styling mode. `ted-style` = self-contained "Ted's Home Theater" look; `ha` = follow HA theme. */
export type LightCardTheme = "ted-style" | "ha";

/** Source for the indicator bar and icon colors when the light is on. */
export type BrightnessColorMode = "theme" | "light" | "other";

/** An action that can be bound to a tap / double-tap / long-press on a region. */
export type LightAction =
  | "increase"
  | "decrease"
  | "full_on"
  | "full_off"
  | "toggle"
  | "more_info"
  | "none";

/** Brightness "memory" source used when the card turns a dimmable light on. */
export type MemoryMode = "off" | "static" | "helper";

export interface LightCardConfig extends LovelaceCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  width?: number;
  height?: number;
  theme?: LightCardTheme;
  indicator_color?: BrightnessColorMode;
  indicator_color_custom?: number[];
  indicator_width?: number;
  show_indicator?: boolean;
  icon_color?: BrightnessColorMode;
  icon_color_custom?: number[];
  background_on?: string;
  brushed?: boolean;
  rocker?: boolean;
  show_name?: boolean;
  name_scale?: number;
  show_icon?: boolean;
  icon_scale?: number;
  show_state?: boolean;
  show_hint?: boolean;
  hint_width?: number;
  // Switch behavior: action bound to each region × gesture.
  up_tap?: LightAction;
  up_double_tap?: LightAction;
  up_hold?: LightAction;
  down_tap?: LightAction;
  down_double_tap?: LightAction;
  down_hold?: LightAction;
  icon_tap?: LightAction;
  icon_double_tap?: LightAction;
  icon_hold?: LightAction;
  // Brightness memory (dimmable lights).
  memory_mode?: MemoryMode;
  memory_value?: number;
  memory_entity?: string;
}
