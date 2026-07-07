import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Ted Settings card. */
export interface SettingsCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Settings". */
  title?: string;
  /** Which scopes to expose. Defaults to both tabs. */
  show_global?: boolean;
  show_device?: boolean;

  // Visual
  theme?: TedStyleTheme;
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
}
