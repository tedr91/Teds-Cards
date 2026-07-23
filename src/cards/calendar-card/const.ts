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

/** Fallback icon passed to daylight when an icon is missing or can't be mapped to MDI. */
export const MDI_FALLBACK_ICON = "mdi:calendar-month-outline";

/** Best-effort keyword → MDI map for converting non-MDI icons. First match wins, so
 *  order from most specific to most general. daylight-calendar-card only renders MDI. */
const NON_MDI_KEYWORD_MAP: [RegExp, string][] = [
  [/birthday|cake/, "mdi:cake-variant"],
  [/school|classroom|education|graduat|book/, "mdi:school"],
  [/work|office|briefcase|job|meeting/, "mdi:briefcase"],
  [/child|kid|baby|infant/, "mdi:baby-face-outline"],
  [/family|people|group|users|team/, "mdi:account-group"],
  [/person|account|profile|contact|user/, "mdi:account"],
  [/therapy|health|medical|doctor|hospital|clinic|pharmac/, "mdi:heart-pulse"],
  [/heart|love|valentine/, "mdi:heart"],
  [/soccer|football|basketball|baseball|hockey|tennis|sport|golf|gym|fitness|workout/, "mdi:soccer"],
  [/music|spotify|audio|song|concert|band/, "mdi:music"],
  [/movie|film|cinema|netflix|tv|show/, "mdi:movie-open"],
  [/game|gaming|xbox|playstation|nintendo|steam/, "mdi:gamepad-variant"],
  [/food|meal|restaurant|dinner|lunch|breakfast|eat|cook|kitchen/, "mdi:silverware-fork-knife"],
  [/coffee|cafe|starbucks/, "mdi:coffee"],
  [/shop|cart|store|amazon|purchase|buy|grocery/, "mdi:cart"],
  [/travel|plane|flight|trip|vacation|airport/, "mdi:airplane"],
  [/car|vehicle|auto|drive|garage/, "mdi:car"],
  [/home|house/, "mdi:home"],
  [/dog|puppy|paw/, "mdi:dog"],
  [/cat|kitten/, "mdi:cat"],
  [/pet|animal/, "mdi:paw"],
  [/gift|present|holiday|christmas/, "mdi:gift"],
  [/bell|reminder|notification|alert/, "mdi:bell"],
  [/alarm|clock|time|timer/, "mdi:clock-outline"],
  [/star|favorite|favourite/, "mdi:star"],
  [/flag/, "mdi:flag"],
  [/map|location|place|pin|address/, "mdi:map-marker"],
  [/calendar|schedule|agenda|date|event|appointment/, "mdi:calendar-month-outline"],
];

/** Coerce any icon to an MDI icon daylight can render: MDI icons pass through, non-MDI
 *  icons are best-effort mapped by keyword, and anything unmatched (or missing) falls
 *  back to {@link MDI_FALLBACK_ICON}. */
export function mdiIconFor(icon: string | null | undefined): string {
  const trimmed = typeof icon === "string" ? icon.trim() : "";
  if (!trimmed) return MDI_FALLBACK_ICON;
  if (trimmed.toLowerCase().startsWith("mdi:")) return trimmed;
  // Non-MDI (cbi:, si:, phu:, mdil:, …) — keyword-match on the slug after the prefix.
  const slug = (trimmed.includes(":") ? trimmed.slice(trimmed.indexOf(":") + 1) : trimmed).toLowerCase();
  for (const [re, mdi] of NON_MDI_KEYWORD_MAP) if (re.test(slug)) return mdi;
  return MDI_FALLBACK_ICON;
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
  week_start_hour: 8,
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
  combine_calendars: true,
  combine_calendars_width: 6,
};
