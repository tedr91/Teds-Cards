import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * How the thermostats are arranged on the Climate view.
 * - `auto`       — a responsive grid that wraps to fit (shows them all).
 * - `tabbed`     — one thermostat at a time, switched via a tab strip.
 * - `vertical`   — a single column, each thermostat stacked top-to-bottom.
 * - `horizontal` — a single row, each thermostat side-by-side (scrolls).
 */
export type ClimateLayout = "auto" | "tabbed" | "vertical" | "horizontal";

/** A single thermostat within the card. */
export interface ClimateItemConfig {
  /** A `climate.*` entity. */
  entity: string;
}

export interface ClimateCardConfig extends LovelaceCardConfig {
  type: string;
  /** The thermostats shown in the card. Omit when `climate_source: settings`. */
  entities?: (string | ClimateItemConfig)[];
  /** Where the thermostat list comes from. `config` (default) uses `entities`;
   *  `settings` uses this device's per-device Temperatures list. */
  climate_source?: "config" | "settings";
  /** Arrangement of the thermostats. In `settings` mode (and when unset) it comes
   *  from this device's `climate_layout` setting; otherwise defaults to `auto`. */
  layout?: ClimateLayout;
  /** Passed to each native thermostat card. Defaults to true. */
  show_current_as_primary?: boolean;
  /** Fill the parent (e.g. a grid-layout content area) instead of sizing to content. */
  fill?: boolean;
  theme?: TedStyleTheme;
  /** Empty-state overrides (settings mode with no thermostats). */
  empty_title?: string;
  empty_message?: string;
  /** Where the empty-state "Settings" button navigates. Supports `[root]`. */
  settings_path?: string;
}
