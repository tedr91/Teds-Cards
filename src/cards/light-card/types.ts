import { LovelaceCardConfig } from "custom-card-helpers";

/** Visual styling mode. `ted-style` = self-contained "Ted's Home Theater" look; `ha` = follow HA theme. */
export type LightCardTheme = "ted-style" | "ha";

/** Source for the brightness hint-bar color when the light is on. */
export type BrightnessColorMode = "theme" | "light" | "other";

export interface LightCardConfig extends LovelaceCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  theme?: LightCardTheme;
  brightness_color?: BrightnessColorMode;
  brightness_color_custom?: number[];
}
