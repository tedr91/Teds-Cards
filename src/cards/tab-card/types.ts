import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** What each tab button shows in the strip. */
export type TabHeaderMode = "both" | "icon" | "name";

/** A HACS/custom-element dependency a tab needs in order to render its card. When the
 *  element isn't registered, the tab shows a friendly "install this" messagebox instead
 *  of Home Assistant's raw "Configuration error". */
export interface TabRequirement {
  /** Custom element tag that must be registered (the `custom:` prefix is optional). */
  element: string;
  /** Friendly plugin/card name shown in the messagebox. Defaults to the element tag. */
  name?: string;
  /** HACS repo / docs URL linked from the messagebox for installing the dependency. */
  url?: string;
}

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
  /** Custom-element dependencies; a friendly messagebox replaces the card when any is
   *  missing (and swaps back to the real card once the element registers). */
  requires?: TabRequirement[];
  /**
   * Settings key that gates this tab (requires `dashboard_integration`). The tab is only
   * shown when the effective setting is truthy; otherwise it's disabled — dropped from the
   * strip and never rendered (e.g. `vision_enabled` hides the Vision tab when Vision is off).
   */
  enabled_setting?: string;
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
  /** Hide the tab strip automatically when only one tab is enabled/visible. */
  hide_single_tab?: boolean;
  /** Feed the backend settings store so `enabled_setting` gating works. */
  dashboard_integration?: boolean;
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
