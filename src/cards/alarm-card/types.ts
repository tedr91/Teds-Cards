import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Alarm card. Appearance mirrors the other Ted's Cards. */
export interface AlarmCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Alarms". */
  title?: string;
  /** Alarms sensor entity. Defaults to `sensor.teds_alarms`. */
  entity?: string;

  // Visual
  theme?: TedStyleTheme;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;

  /** Show the header "+" button that opens the new-alarm dialog. Defaults to true. */
  show_add?: boolean;
}
