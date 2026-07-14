import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * Where the calendar entities come from.
 * - `config` (default) — the card's own `entities`.
 * - `settings`         — this device's `calendars_list` (Settings → Calendars).
 * If none resolve, the card shows its empty state (it doesn't invent calendars).
 */
export type CalendarSource = "settings" | "config";

export interface CalendarCardConfig extends LovelaceCardConfig {
  type: string;
  /** Explicit `calendar.*` entities. Used when `calendar_source: config`. */
  entities?: string[];
  /** Where the calendar entities come from. Defaults to `config`. */
  calendar_source?: CalendarSource;
  /** The Daylight Calendar view to open on (`month`, `week`, `schedule`, `agenda`, …). */
  default_view?: string;
  /** Extra options merged into the embedded `daylight-calendar-card` config
   *  (wins over the baked-in defaults; `type`/`entities`/`default_view` are managed
   *  by this card). */
  calendar_config?: Record<string, unknown>;
  /** Fill the parent container (e.g. a dashboard view area) instead of sizing to
   *  content. Off (default) lets the calendar size itself. */
  fill?: boolean;
  theme?: TedStyleTheme;
  /** Empty-state overrides (settings mode with no calendars and no fallback). */
  empty_title?: string;
  empty_message?: string;
  /** Missing-dependency-state overrides (daylight-calendar-card not installed). */
  missing_title?: string;
  missing_message?: string;
  /** Where the empty-state "Settings" button navigates. Supports `[root]`. */
  settings_path?: string;
}
