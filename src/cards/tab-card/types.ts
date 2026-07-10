import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** What each tab button shows in the strip. */
export type TabHeaderMode = "both" | "icon" | "name";

/** One tab in the tab card: a label/icon plus the child card it displays. */
export interface TabConfig {
  /** Tab label shown in the tab strip. */
  label?: string;
  /** Optional mdi icon shown before the label. */
  icon?: string;
  /**
   * URL-param value that deep-links to this tab (e.g. `?tab=timers`). When unset,
   * the tab is matched by its zero-based index instead.
   */
  slug?: string;
  /** The card rendered when this tab is active. */
  card?: LovelaceCardConfig;
}

/** Configuration for `ted-tab-card`. */
export interface TabCardConfig extends LovelaceCardConfig {
  type: string;
  tabs?: TabConfig[];
  /** Zero-based index of the tab shown by default (when no URL param matches). */
  default_tab?: number;
  /** URL query parameter name that selects the active tab. Defaults to `tab`. */
  url_param?: string;
  /** Hide the tab strip (e.g. when a single tab, or tabs are driven externally). */
  show_tabs?: boolean;
  /** What each tab button shows: icon + name (default), icon only, or name only. */
  tab_header?: TabHeaderMode;
  /**
   * Automatically display only the tabs' icons when the tabs don't naturally fit
   * on the screen. Defaults to `true`.
   */
  auto_shrink?: boolean;

  // Appearance (shared with the other Ted's cards).
  theme?: TedStyleTheme;
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  scale?: number;
}
