import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * Where the calendar entities come from.
 * - `config` (default) — the card's own `entities`.
 * - `settings`         — this device's `calendars_list` (Settings → Calendars).
 * If none resolve, the card shows its empty state (it doesn't invent calendars).
 */
export type CalendarSource = "settings" | "config";

/** How a calendar's badge is chosen: its person's avatar, or a static icon. */
export type CalendarIconSource = "person" | "icon";

/** A single calendar within the card, with optional per-calendar overrides. */
export interface CalendarItemConfig {
  /** A `calendar.*` entity. */
  entity: string;
  /** Display name (defaults to the calendar's own name). */
  name?: string;
  /** Whether events on this calendar are read-only (no editing). Default true. */
  readonly?: boolean;
  /** Whether this calendar's badge is shown in the header. Default true. */
  show_badge?: boolean;
  /** Whether birthday cake day-badges are shown for this calendar. Default true.
   *  Birthday-named calendars badge all events; others badge birthday-titled events. */
  show_birthday_badge?: boolean;
  /** Whether to hide event times on this calendar (all-day style). Default false. */
  hide_times?: boolean;
  /** A `person.*` entity whose avatar represents this calendar. */
  person?: string;
  /** A badge icon (defaults to the calendar's own icon). */
  icon?: string;
  /** Whether the badge shows the linked person's avatar or the icon. Default `icon`. */
  icon_source?: CalendarIconSource;
  /** Event colour (hex, e.g. `#43a1ce`). */
  color?: string;
}

export interface CalendarCardConfig extends LovelaceCardConfig {
  type: string;
  /** The calendars shown (ids or per-calendar objects). Used when `calendar_source: config`. */
  entities?: (string | CalendarItemConfig)[];
  /** Where the calendar entities come from. Defaults to `config`. */
  calendar_source?: CalendarSource;
  /** The Daylight Calendar view to open on (`month`, `week`, `schedule`, `agenda`, …). */
  default_view?: string;

  // --- Appearance ---
  /** The calendar's title/name (shown in the header). */
  name?: string;
  /** Show the title/name. Default true. */
  show_name?: boolean;
  /** Surface styling: `ha` (Home Assistant theme, default) or `ted` (Ted's frosted theme). */
  theme?: TedStyleTheme;
  /** Slightly dim weekends so weekdays stand out (adds a daylight `day_styles` rule). */
  emphasize_weekdays?: boolean;
  /** Card background colour (hex). Overrides the theme surface. */
  background_color?: string;
  /** Background transparency 0–100 (% see-through). */
  transparency?: number;
  /** Background blur in px (frosts whatever is behind a translucent background). */
  blur?: number;
  /** Show the calendar header. Default true. */
  show_header?: boolean;
  /** Header background colour (hex). */
  header_color?: string;
  /** Header background transparency 0–100 (% see-through). A card-wide `blur` frosts it. */
  header_transparency?: number;
  /** Allow toggling calendars on/off from the header. Default true (only when the header is shown). */
  allow_calendar_toggling?: boolean;
  /** A `weather.*` entity shown in the header. */
  weather_sensor?: string;
  /** Fixed width in px. Only used when the card isn't a direct item in a grid (Sections) view. */
  width?: number;
  /** Fixed height in px. Only used when the card isn't a direct item in a grid (Sections) view. */
  height?: number;

  /** Extra options merged into the embedded `daylight-calendar-card` config
   *  (wins over everything this card sets; `type`/`entities` are managed by this card). */
  calendar_config?: Record<string, unknown>;
  /** Fill the parent container (e.g. a dashboard view area) instead of sizing to
   *  content. Off (default) lets the calendar size itself. */
  fill?: boolean;
  /** Empty-state overrides (no calendars selected). */
  empty_title?: string;
  empty_message?: string;
  /** Missing-dependency-state overrides (daylight-calendar-card not installed). */
  missing_title?: string;
  missing_message?: string;
  /** Where the empty-state "Settings" button navigates. Supports `[root]`. */
  settings_path?: string;
}
