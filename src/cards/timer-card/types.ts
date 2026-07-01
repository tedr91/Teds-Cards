import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Timer card. Appearance mirrors the other Ted's Cards. */
export interface TimerCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Timers". */
  title?: string;
  /** Timers sensor entity. Defaults to `sensor.teds_timers`. */
  entity?: string;

  // Visual
  theme?: TedStyleTheme;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;

  /** Show the "Current Running" list of active timers. Defaults to true. */
  show_active?: boolean;
  /** Show the "New Timer" start form. Defaults to true. */
  show_add?: boolean;
  /** Show the "Recent Timers" quick-restart chips. Defaults to true. */
  show_recent?: boolean;

  /** Order of the card sections. Any of "active", "add", "recent". */
  section_order?: string[];
}
