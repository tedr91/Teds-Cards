import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Timer card. Appearance mirrors the other Ted's Cards. */
export interface TimerCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Timers". */
  title?: string;
  /** Optional area to scope this card to. When set, only timers tagged with this
   *  area are shown, and new timers started here are tagged with it. Unset = all. */
  area?: string;

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

  /** Show the "Current Running" list of active timers. Defaults to true. */
  show_active?: boolean;
  /** Show the "New Timer" start form. Defaults to true. */
  show_add?: boolean;
  /** Show the "Recent Timers" quick-restart chips. Defaults to true. */
  show_recent?: boolean;

  /** Order of the card sections. Any of "active", "add", "recent". */
  section_order?: string[];
}
