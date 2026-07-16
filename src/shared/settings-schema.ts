/**
 * The Ted's Cards settings schema — a single source of truth for the field list,
 * types, defaults, and grouping used by the Settings card. Keys and default values
 * MUST stay in sync with the backend's `SETTINGS_DEFAULTS` in `const.py`.
 */

export type SettingsValue =
  | boolean
  | number
  | string
  | string[]
  | { [key: string]: unknown }
  | null;
export type SettingsMap = Record<string, SettingsValue>;

/** How a setting is edited / rendered in the Settings card. */
export type SettingKind =
  | "boolean"
  | "number"
  | "percent"
  | "text"
  | "entity"
  | "media"
  | "select"
  | "entity-list"
  | "background"
  | "nightmode"
  | "launcher";

export interface SettingField {
  key: string;
  label: string;
  group: string;
  kind: SettingKind;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
  /** For `select` fields, the choosable options (value stored, label shown). */
  options?: { value: string; label: string }[];
  /** For `entity` fields, restrict the picker to this domain (e.g. media_player). */
  entityDomain?: string;
  /** For `entity` fields, restrict the picker to entities from this integration
   *  platform (entity-registry `platform`, e.g. `music_assistant`). */
  entityPlatform?: string;
  /** Only meaningful per-device (no sensible global value) — greyed out in the Global tab. */
  deviceOnly?: boolean;
  /** Root-relative dashboard path: rendered with a fixed `<dashboard_root>/` prefix,
   *  stored as `[root]/<segment>` (so the value stays root-portable). */
  rootRelative?: boolean;
  /** Grouped under a collapsible subsection (by this name) at the bottom of its group,
   *  after the group's un-subsectioned fields. */
  subsection?: string;
}

export const SETTINGS_GROUPS = [
  "General",
  "Navigation",
  "Navbar",
  "Sounds",
  "Alarms/Timers",
  "Calendars",
  "Cameras",
  "Thermostats"
] as const;

/** Per-category tab icons — a Fluent icon (used when the `fluent` iconset is installed)
 *  with an mdi fallback for when it isn't. */
export const SETTINGS_GROUP_ICONS: Record<string, { fluent: string; mdi: string }> = {
  General: { fluent: "fluent:settings-24-regular", mdi: "mdi:tune" },
  Navigation: { fluent: "fluent:dashboard-20-regular", mdi: "mdi:navigation-variant-outline" },
  Navbar: { fluent: "fluent:panel-bottom-20-filled", mdi: "mdi:dock-bottom" },
  Sounds: { fluent: "fluent:speaker-2-24-regular", mdi: "mdi:volume-high" },
  "Alarms/Timers": { fluent: "fluent:clock-alarm-24-regular", mdi: "mdi:alarm" },
  Cameras: { fluent: "fluent:video-24-regular", mdi: "mdi:cctv" },
  Thermostats: { fluent: "fluent:temperature-24-regular", mdi: "mdi:thermometer" },
  Calendars: { fluent: "fluent:calendar-ltr-24-regular", mdi: "mdi:calendar" },
};

/** Default values — must match the backend `SETTINGS_DEFAULTS`. */
export const SETTINGS_DEFAULTS: SettingsMap = {
  timer_snooze_enabled: true,
  timer_snooze_minutes: 1,
  timer_alert_sound: "default",
  timer_alert_volume: 60,
  timer_alert_repeat: true,
  alarm_snooze_enabled: true,
  alarm_snooze_minutes: 9,
  alarm_alert_sound: "default",
  alarm_alert_volume: 70,
  alarm_alert_repeat: true,
  notification_sound: "default",
  notification_volume: 50,
  notification_sound_info: "default",
  notification_sound_success: "default",
  notification_sound_warning: "default",
  notification_sound_danger: "default",
  notification_sound_tip: "default",
  music_player: null,
  music_volume: 5,
  system_sound_player: null,
  cameras_list: [],
  calendars_list: [],
  calendar_options: {},
  calendar_name: "Family Calendar",
  calendar_theme: "ha",
  calendar_view: "month",
  calendar_emphasize_weekdays: true,
  cameras_layout: "auto",
  climate_list: [],
  climate_layout: "auto",
  navbar_auto_hide: false,
  navbar_auto_hide_delay: 5,
  navbar_float: false,
  navbar_position: "bottom",
  navbar_size: 48,
  launcher_enabled: true,
  launcher_section: "center",
  launcher_combine_groups: true,
  launcher_quick_launch: true,
  launcher_list: [],
  launcher_options: {},
  launcher_highlight_active: true,
  launcher_button_color: "white",
  launcher_highlight_color: "accent",
  do_not_disturb: false,
  debug_mode: false,
  icon_set: "auto",
  weather_entity: null,
  night_enabled: true,
  night_start: "21:00:00",
  night_end: "07:00:00",
  night_dim_brightness: 75,
  night_dim_background: 25,
  night_font_color: "red",
  night_transition_seconds: 30,
  night_dark_mode: true,
  night_brightness_entity: null,
  night_day_snapshot: null,
  background_mode: "solid",
  background_scroll: false,
  background_size: "fill",
  background_align: "center",
  background_repeat: "tile",
  background_color: "#57608E",
  background_gradient: true,
  background_image: null,
  background_recent_images: [],
  background_album: "builtin",
  background_folder: null,
  background_type_pref: "match",
  background_shuffle: true,
  background_cycle_minutes: 30,
  background_bing_cache_size: 100,
  background_enhance_readability: true,
  background_readability_strength: 45,
  background_brightness: 75,
  dashboard_root: "ted-dashboard",
  home_dashboard: "[root]/home-welcome",
  alarms_dashboard: "[root]/alarms-timers?tab=alarms",
  timers_dashboard: "[root]/alarms-timers?tab=timers",
  weather_dashboard: "[root]/weather",
  calendar_dashboard: "[root]/calendar-month",
  cameras_dashboard: "[root]/cameras",
  climate_dashboard: "[root]/climate",
  music_dashboard: "[root]/music",
  photos_dashboard: "[root]/photos",
  info_dashboard: "[root]/info",
  announce_dashboard: "[root]/announce",
  auto_return_home_after: 0,
};

export const SETTINGS_FIELDS: SettingField[] = [
  // Sounds
  { key: "system_sound_player", label: "System sounds player", group: "Sounds", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Alarms, timers, alerts & notifications play on this speaker. Set per-device." },
  { key: "music_player", label: "Music player", group: "Sounds", subsection: "Music", kind: "entity", entityDomain: "media_player", entityPlatform: "music_assistant", deviceOnly: true, help: "Music Assistant player for the Music view. Falls back to the system sounds player. Set per-device." },
  { key: "music_volume", label: "Music volume", group: "Sounds", subsection: "Music", kind: "percent" },
  { key: "do_not_disturb", label: "Do Not Disturb", group: "Sounds", subsection: "Notifications", kind: "boolean", help: "Suppresses toasts and alert sounds on this device." },
  { key: "notification_volume", label: "Sound volume", group: "Sounds", subsection: "Notifications", kind: "percent" },
  { key: "notification_sound", label: "Alert sound (default)", group: "Sounds", subsection: "Notifications", kind: "media", help: "Fallback sound for notifications of any severity." },
  { key: "notification_sound_info", label: "Info sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_success", label: "Success sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_warning", label: "Warning sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_danger", label: "Danger sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_tip", label: "Tip sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "\"default\" uses the fallback above." },
  { key: "alarm_alert_volume", label: "Alarms volume", group: "Sounds", subsection: "Alarms", kind: "percent" },
  { key: "alarm_alert_sound", label: "Alarms sound", group: "Sounds", subsection: "Alarms", kind: "media" },
  { key: "timer_alert_volume", label: "Timers volume", group: "Sounds", subsection: "Timers", kind: "percent" },
  { key: "timer_alert_sound", label: "Timers sound", group: "Sounds", subsection: "Timers", kind: "media" },
  // Alarms/Timers
  { key: "alarm_alert_repeat", label: "Repeat alert", group: "Alarms/Timers", subsection: "Alarms", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  { key: "alarm_snooze_enabled", label: "Enable snoozing", group: "Alarms/Timers", subsection: "Alarms", kind: "boolean" },
  { key: "alarm_snooze_minutes", label: "Snooze duration", group: "Alarms/Timers", subsection: "Alarms", kind: "number", min: 1, max: 60, unit: "min" },
  { key: "timer_alert_repeat", label: "Repeat alert", group: "Alarms/Timers", subsection: "Timers", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  { key: "timer_snooze_enabled", label: "Enable snoozing", group: "Alarms/Timers", subsection: "Timers", kind: "boolean" },
  { key: "timer_snooze_minutes", label: "Snooze duration", group: "Alarms/Timers", subsection: "Timers", kind: "number", min: 1, max: 60, unit: "min" },
  // Cameras
  {
    key: "cameras_layout",
    label: "Layout",
    group: "Cameras",
    kind: "select",
    options: [
      { value: "auto", label: "Auto grid" },
      { value: "single", label: "Single" },
      { value: "quad", label: "Quad (2×2)" },
      { value: "big-small", label: "Multi" },
    ],
    help: "How this device arranges its cameras on the Cameras view.",
  },
  { key: "cameras_list", label: "Cameras", group: "Cameras", kind: "entity-list", entityDomain: "camera", help: "Global lists the available cameras; each device curates its own subset." },
  // Thermostats
  {
    key: "climate_layout",
    label: "Layout",
    group: "Thermostats",
    kind: "select",
    options: [
      { value: "auto", label: "Auto grid" },
      { value: "tabbed", label: "Tabbed" },
      { value: "vertical", label: "Vertical stack" },
      { value: "horizontal", label: "Horizontal stack" },
    ],
    help: "How this device arranges its thermostats on the Climate view.",
  },
  { key: "climate_list", label: "Thermostats", group: "Thermostats", kind: "entity-list", entityDomain: "climate", help: "Global lists the available thermostats; each device curates its own subset." },
  // Calendars
  { key: "calendar_name", label: "Name", group: "Calendars", kind: "text", help: "Title shown at the top of the calendar. Leave empty for no title." },
  {
    key: "calendar_theme",
    label: "Theme",
    group: "Calendars",
    kind: "select",
    options: [
      { value: "ha", label: "Home Assistant Theme" },
      { value: "ted-style", label: "Ted's Theme" },
    ],
    help: "Ted's Theme adds a frosted, translucent surface behind the calendar.",
  },
  {
    key: "calendar_view",
    label: "Default view",
    group: "Calendars",
    kind: "select",
    options: [
      { value: "month", label: "Month" },
      { value: "week", label: "Week" },
      { value: "schedule", label: "Schedule" },
      { value: "agenda", label: "Agenda" },
    ],
    help: "The view the calendar opens on.",
  },
  { key: "calendar_emphasize_weekdays", label: "Emphasize weekdays", group: "Calendars", kind: "boolean", help: "Slightly dim weekends so weekdays stand out." },
  { key: "calendars_list", label: "Calendars", group: "Calendars", kind: "entity-list", entityDomain: "calendar", help: "Global lists the available calendars; each device curates its own subset. Shown by Ted's Calendar card." },
  // Navbar
  { key: "navbar_auto_hide", label: "Auto-hide", group: "Navbar", kind: "boolean", help: "Collapse the navbar into its edge until revealed." },
  { key: "navbar_auto_hide_delay", label: "Auto-hide delay", group: "Navbar", kind: "number", min: 1, max: 60, unit: "s", help: "Seconds before the revealed bar re-collapses." },
  { key: "navbar_float", label: "Float", group: "Navbar", kind: "boolean", help: "Center the bar with margins and rounded corners (horizontal bars only)." },
  { key: "navbar_position", label: "Position", group: "Navbar", kind: "select",
    options: [
      { value: "bottom", label: "Bottom" },
      { value: "top", label: "Top" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    help: "Where the bar sits on the screen.",
  },
  { key: "navbar_size", label: "Size", group: "Navbar", kind: "number", min: 32, max: 96, unit: "px", help: "Bar thickness in pixels (buttons/items size from this)." },
  { key: "launcher", label: "Launcher Buttons", group: "Navbar", kind: "launcher", help: "Auto-discovered buttons that navigate to this dashboard's views. Shown on navbars with backend_integration." },
  // General
  { key: "weather_entity", label: "Weather entity", group: "General", kind: "entity", entityDomain: "weather", help: "Default weather entity used by Ted's weather/clock cards that opt in via `backend_integration: true`." },
  {
    key: "icon_set",
    label: "Icon set",
    group: "General",
    kind: "select",
    options: [
      { value: "auto", label: "Auto (best installed)" },
      { value: "fluent", label: "Fluent" },
      { value: "streamline-ultimate-color", label: "Streamline Ultimate" },
      { value: "streamline-freehand-color", label: "Streamline Freehand" },
      { value: "pepicons-print", label: "Pepicons" },
      { value: "mdi", label: "Material Design (MDI)" },
    ],
    help: "Which icon family Ted's built-in icons use. Auto picks the best installed set; a specific set falls back to Material Design when an icon isn't available.",
  },
  { key: "night_mode", label: "Automatic night mode", group: "General", kind: "nightmode", help: "Automatically dims the background, lowers screen brightness, and switches to a night font color on a nightly schedule, restoring day values in the morning." },
  { key: "background", label: "Background Wallpaper", group: "General", kind: "background", help: "Dashboard background painted by the invisible ted-background-card." },
  { key: "debug_mode", label: "Debug mode", group: "General", kind: "boolean", subsection: "Advanced", help: "Publishes the --ted-debug CSS variable so dashboards can show layout debug outlines." },
  // Navigation
  { key: "auto_return_home_after", label: "Auto-return home after", group: "Navigation", kind: "number", min: 0, max: 3600, unit: "s", help: "0 = never." },
  { key: "dashboard_root", label: "Dashboard root", group: "Navigation", kind: "text" },
  { key: "home_dashboard", label: "Home dashboard", group: "Navigation", kind: "text", rootRelative: true, help: "The view the Home button opens." },
  { key: "alarms_dashboard", label: "Alarms dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "timers_dashboard", label: "Timers dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "weather_dashboard", label: "Weather dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "calendar_dashboard", label: "Calendar dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "cameras_dashboard", label: "Cameras dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "climate_dashboard", label: "Climate dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "music_dashboard", label: "Music dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "photos_dashboard", label: "Photos dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "info_dashboard", label: "Info dashboard", group: "Navigation", kind: "text", rootRelative: true },
  { key: "announce_dashboard", label: "Announce dashboard", group: "Navigation", kind: "text", rootRelative: true },
];

/** Fields grouped for the card UI, in declared order per group. */
export function fieldsByGroup(): { group: string; fields: SettingField[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    fields: SETTINGS_FIELDS.filter((f) => f.group === group),
  })).filter((g) => g.fields.length > 0);
}
