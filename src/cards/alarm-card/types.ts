import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Alarm card. Appearance mirrors the other Ted's Cards. */
export interface AlarmCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Alarms". */
  title?: string;
  /** Optional area to scope this card to. When set, only alarms tagged with this
   *  area are shown, and new alarms created here are tagged with it. Unset = all. */
  area?: string;
  /** Show the scoped area name next to the title, e.g. "Alarms (Kitchen)". Defaults to true. */
  show_area_in_title?: boolean;

  // Visual
  theme?: TedStyleTheme;
  /** Optional override for the card background (hex/rgb/hsl/var or a theme color name). */
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  /** Overall card scale, as a percentage (50–200). Defaults to 100. */
  scale?: number;

  // Header
  /** Show the header icon. Defaults to true. */
  show_header_icon?: boolean;
  /** Header icon size override, as a percentage (10–400). Blank = 100. */
  header_icon_size?: number;
  /** Show the header title. Defaults to true. */
  show_header_name?: boolean;
  /** Header title size override, as a percentage (10–400). Blank = 100. */
  header_name_size?: number;
  /** Show a divider line under the header. Defaults to false. */
  header_divider?: boolean;

  /** Show the header "+" button that opens the new-alarm dialog. Defaults to true. */
  show_add?: boolean;
}
