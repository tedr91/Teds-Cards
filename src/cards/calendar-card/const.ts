import { NAMESPACE } from "../../shared/const";

export const CALENDAR_CARD_TYPE = `${NAMESPACE}-calendar-card`;
export const CALENDAR_CARD_EDITOR_TYPE = `${CALENDAR_CARD_TYPE}-editor`;
export const CALENDAR_CARD_NAME = "Ted Calendar Card";
export const CALENDAR_CARD_DESCRIPTION =
  "Drive a Daylight Calendar (superdingo101/daylight-calendar-card) from this device's Settings calendars.";

/** The third-party card this wrapper renders (custom element tag, no `custom:` prefix). */
export const DAYLIGHT_CARD_TAG = "daylight-calendar-card";
export const DAYLIGHT_CARD_TYPE = `custom:${DAYLIGHT_CARD_TAG}`;

/** The calendar view the wrapped card opens on by default. */
export const DEFAULT_CALENDAR_VIEW = "month";

/** Lowercase alphanumeric word tokens of a name (for person auto-matching). */
export function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Best `person.*` entity whose name shares the most exact word tokens with the
 *  calendar name (exact tokens, so "Ted" ≠ "Teddy"), or undefined when none match. */
export function matchPerson(
  states: Record<string, { attributes?: Record<string, unknown> } | undefined> | undefined,
  calendarName: string,
): string | undefined {
  if (!states) return undefined;
  const calTokens = nameTokens(calendarName);
  if (!calTokens.length) return undefined;
  let best: { id: string; score: number } | undefined;
  for (const id of Object.keys(states)) {
    if (!id.startsWith("person.")) continue;
    const pname = states[id]?.attributes?.friendly_name;
    if (typeof pname !== "string" || !pname) continue;
    let shared = 0;
    for (const t of nameTokens(pname)) if (calTokens.includes(t)) shared++;
    if (shared > 0 && (!best || shared > best.score)) best = { id, score: shared };
  }
  return best?.id;
}

/**
 * Ted's baked-in Daylight Calendar configuration. Everything except `type`,
 * `entities`, and `default_view` (which the wrapper supplies) lives here, so a
 * dashboard only has to place `custom:ted-calendar-card` and optionally set the
 * view. Any of these can be overridden per-card via `calendar_config`.
 */
export const CALENDAR_DEFAULT_CONFIG: Record<string, unknown> = {
  first_day_of_week: 0,
  week_days: [0, 1, 2, 3, 4, 5, 6],
  week_start_hour: 6,
  week_end_hour: 23,
  lock_schedule_hours: true,
  hide_the_past: false,
  past_event_mode: "muted",
  disable_swipe_controls: false,
  show_all_events_month: false,
  show_all_details_month: false,
  hide_empty_days: false,
  agenda_compact_events: true,
  shorten_event_times: true,
  display_full_weekday_names: false,
  compact_width: true,
  show_current_time_bar: true,
  show_event_location: true,
  use_short_location: true,
  event_location_font_size: 9,
  event_calendar_friendly_name: false,
  event_title_prefix: "none",
  combine_style: "bars",
  combine_background: "primary",
  event_color_mode: "left-tint",
  event_neutral_background: "#F8F3E9",
  event_tint_opacity: 80,
  event_color_bar_width: 6,
  day_badges: [],
  hide_calendars: false,
  hide_header: false,
  hide_year: false,
  hide_controls: false,
  hide_navigation_buttons: false,
  hide_add_event_button: false,
  hide_view_selector: false,
  hide_dark_mode_toggle: false,
  show_dashboard_nav_button: false,
  header_dashboard_path: null,
  header_weather_sensor: "weather.forecast_home",
  calendar_person_entities: {
    "calendar.chanisha_s_gmail_com": "person.chanisha_somatilaka",
    "calendar.ted_outlook_calendar": "person.ted_roberts",
    "calendar.family": "person.wallpanel",
  },
  default_hidden_calendars: [],
  color_scheme: "auto",
  enable_event_management: true,
  event_modal_size: "medium",
  rolling_days_week_compact: 6,
  rolling_days_schedule: 6,
  rolling_days_agenda: 4,
  compact_height: true,
  compact_header: true,
  hide_calendar_names: true,
  colors: {
    "calendar.birthdays_2": "#00c700",
    "calendar.chanisha_s_gmail_com": "#9c5fff",
    "calendar.family": "#738eb0",
    "calendar.hockey_canadian_bacon": "#0050ff",
    "calendar.hockey_maple_bars": "#0050ff",
    "calendar.holidays_in_united_states": "#F7DC6F",
    "calendar.ted_outlook_calendar": "#43a1ce",
  },
  calendar_names: {
    "calendar.chanisha_s_gmail_com": "Chanisha Calendar",
    "calendar.ted_outlook_calendar": "Ted Calendar",
  },
  combine_calendars: true,
  combine_calendars_width: 6,
  readonly_calendars: [
    "calendar.birthdays_2",
    "calendar.chanisha_s_gmail_com",
    "calendar.hockey_canadian_bacon",
    "calendar.hockey_maple_bars",
    "calendar.holidays_in_united_states",
    "calendar.ted_outlook_calendar",
  ],
  virtual_calendars: [
    {
      id: "virtual_1",
      name: "Ted",
      icon: null,
      color: "#578eb5",
      entities: [
        "calendar.hockey_canadian_bacon",
        "calendar.hockey_maple_bars",
        "calendar.ted_outlook_calendar",
      ],
    },
  ],
  hide_times_for_calendars: ["calendar.holidays_in_united_states", "calendar.birthdays_2"],
  calendar_badge_icons: {
    "calendar.holidays_in_united_states": "mdi:beach",
    "calendar.birthdays_2": "mdi:balloon",
  },
};
