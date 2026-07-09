import type { TedStyleTheme } from "../../shared/types";

export interface StatusCardConfig {
  type: string;
  /** Visual theme: self-contained "ted-style" (default) or follow the active HA theme. */
  theme?: TedStyleTheme;
  /** Optional heading shown above the status rows. */
  title?: string;
}
