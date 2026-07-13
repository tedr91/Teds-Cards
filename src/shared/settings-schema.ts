/**
 * The Ted's Cards settings schema — a single source of truth for the field list,
 * types, defaults, and grouping used by the Settings card. Keys and default values
 * MUST stay in sync with the backend's `SETTINGS_DEFAULTS` in `const.py`.
 */

export type SettingsValue = boolean | number | string | string[] | null;
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
  | "background";

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
  /** Only meaningful per-device (no sensible global value) — greyed out in the Global tab. */
  deviceOnly?: boolean;
  /** Root-relative dashboard path: rendered with a fixed `<dashboard_root>/` prefix,
   *  stored as `[root]/<segment>` (so the value stays root-portable). */
  rootRelative?: boolean;
}

export const SETTINGS_GROUPS = [
  "General",
  "Navigation",
  "Navbar",
  "Notifications",
  "Alarms",
  "Timers",
  "Media",
  "Cameras",
  "Temperatures"
] as const;

/** Per-category tab icons — a Fluent icon (used when the `fluent` iconset is installed)
 *  with an mdi fallback for when it isn't. */
export const SETTINGS_GROUP_ICONS: Record<string, { fluent: string; mdi: string }> = {
  General: { fluent: "fluent:settings-24-regular", mdi: "mdi:tune" },
  Navigation: { fluent: "fluent:dashboard-20-regular", mdi: "mdi:navigation-variant-outline" },
  Navbar: { fluent: "fluent:panel-bottom-20-filled", mdi: "mdi:dock-bottom" },
  Notifications: { fluent: "fluent:alert-24-regular", mdi: "mdi:bell-outline" },
  Alarms: { fluent: "fluent:clock-alarm-24-regular", mdi: "mdi:alarm" },
  Timers: { fluent: "fluent:timer-24-regular", mdi: "mdi:timer-outline" },
  Media: { fluent: "fluent:play-circle-24-regular", mdi: "mdi:play-circle-outline" },
  Cameras: { fluent: "fluent:video-24-regular", mdi: "mdi:cctv" },
  Temperatures: { fluent: "fluent:temperature-24-regular", mdi: "mdi:thermometer" },
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
  music_volume: 50,
  system_sound_player: null,
  cameras_list: [],
  cameras_layout: "auto",
  climate_list: [],
  climate_layout: "auto",
  navbar_auto_hide: false,
  navbar_auto_hide_delay: 5,
  navbar_float: false,
  navbar_position: "bottom",
  navbar_size: 48,
  do_not_disturb: false,
  debug_mode: false,
  weather_entity: null,
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
  background_enhance_readability: true,
  background_readability_strength: 45,
  dashboard_root: "ted-dashboard",
  home_dashboard: "[root]/welcome",
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
  // Timers
  { key: "timer_alert_volume", label: "Alert volume", group: "Timers", kind: "percent" },
  { key: "timer_alert_sound", label: "Alert sound", group: "Timers", kind: "media" },
  { key: "timer_alert_repeat", label: "Repeat alert", group: "Timers", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  { key: "timer_snooze_enabled", label: "Enable snoozing", group: "Timers", kind: "boolean" },
  { key: "timer_snooze_minutes", label: "Snooze duration", group: "Timers", kind: "number", min: 1, max: 60, unit: "min" },
  // Alarms
  { key: "alarm_alert_volume", label: "Alert volume", group: "Alarms", kind: "percent" },
  { key: "alarm_alert_sound", label: "Alert sound", group: "Alarms", kind: "media" },
  { key: "alarm_alert_repeat", label: "Repeat alert", group: "Alarms", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  { key: "alarm_snooze_enabled", label: "Enable snoozing", group: "Alarms", kind: "boolean" },
  { key: "alarm_snooze_minutes", label: "Snooze duration", group: "Alarms", kind: "number", min: 1, max: 60, unit: "min" },
  // Notifications
  { key: "do_not_disturb", label: "Do Not Disturb", group: "Notifications", kind: "boolean", help: "Suppresses toasts and alert sounds on this device." },
  { key: "notification_volume", label: "Sound volume", group: "Notifications", kind: "percent" },
  { key: "notification_sound", label: "Alert sound (default)", group: "Notifications", kind: "media", help: "Fallback sound for notifications of any severity." },
  { key: "notification_sound_info", label: "Info sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_success", label: "Success sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_warning", label: "Warning sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_danger", label: "Danger sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_tip", label: "Tip sound", group: "Notifications", kind: "media", help: "\"default\" uses the fallback above." },
  // Media
  { key: "music_player", label: "Music & media player", group: "Media", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Speaker for the Music view / Music Assistant. Falls back to the system sounds player. Set per-device." },
  { key: "music_volume", label: "Music volume", group: "Media", kind: "percent" },
  { key: "system_sound_player", label: "System sounds player", group: "Media", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Alarms, timers, alerts & notifications play on this speaker. Set per-device." },
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
  // Temperatures
  {
    key: "climate_layout",
    label: "Layout",
    group: "Temperatures",
    kind: "select",
    options: [
      { value: "auto", label: "Auto grid" },
      { value: "tabbed", label: "Tabbed" },
      { value: "vertical", label: "Vertical stack" },
      { value: "horizontal", label: "Horizontal stack" },
    ],
    help: "How this device arranges its thermostats on the Climate view.",
  },
  { key: "climate_list", label: "Thermostats", group: "Temperatures", kind: "entity-list", entityDomain: "climate", help: "Global lists the available thermostats; each device curates its own subset." },
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
  // General
  { key: "weather_entity", label: "Weather entity", group: "General", kind: "entity", entityDomain: "weather", help: "Default weather entity used by Ted's weather/clock cards that opt in via `backend_integration: true`." },
  { key: "background", label: "Background Wallpaper", group: "General", kind: "background", help: "Dashboard background painted by the invisible ted-background-card." },
  { key: "debug_mode", label: "Debug mode", group: "General", kind: "boolean", help: "Publishes the --ted-debug CSS variable so dashboards can show layout debug outlines." },
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
