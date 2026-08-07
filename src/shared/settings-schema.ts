/**
 * The Ted's Cards settings schema — a single source of truth for the field list,
 * types, defaults, and grouping used by the Settings card. Keys and default values
 * MUST stay in sync with the backend's `SETTINGS_DEFAULTS` in `const.py`.
 */

import { ICON_PACKS } from "./icon-registry";

export type SettingsValue =
  | boolean
  | number
  | string
  | string[]
  | { [key: string]: unknown }
  | null;
export type SettingsMap = Record<string, SettingsValue>;

/** A predefined announcement in the global `announce_messages` list. */
export interface AnnounceMessage {
  id: string;
  label: string;
  text: string;
  icon?: string;
}

/** How a setting is edited / rendered in the Settings card. */
export type SettingKind =
  | "boolean"
  | "number"
  | "percent"
  | "text"
  | "entity"
  | "media"
  | "folder"
  | "select"
  | "entity-list"
  | "announce-messages"
  | "navbar-menu-items"
  | "navbar-sections"
  | "background"
  | "nightmode"
  | "launcher"
  | "dashboard"
  | "device-type";

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
  /** Only render this field when another setting's effective value matches. */
  showWhen?: { key: string; equals?: unknown; truthy?: boolean };
  /** Server-side (global) setting — hidden on the per-device ("This device") tab. */
  globalOnly?: boolean;
}

export const SETTINGS_GROUPS = [
  "General",
  "Dashboards",
  "Navbar",
  "Sounds",
  "Voice",
  "Cameras",
  "Thermostats",
  "Calendars",
  "Alarms/Timers",
  "Photos",
  "Announce"
] as const;

/** Per-category tab icons — a Fluent icon (used when the `fluent` iconset is installed)
 *  with an mdi fallback for when it isn't. */
export const SETTINGS_GROUP_ICONS: Record<string, { fluent: string; mdi: string }> = {
  General: { fluent: "fluent:settings-24-regular", mdi: "mdi:tune" },
  Dashboards: { fluent: "fluent:dashboard-20-regular", mdi: "mdi:navigation-variant-outline" },
  Navbar: { fluent: "fluent:panel-bottom-20-filled", mdi: "mdi:dock-bottom" },
  Sounds: { fluent: "fluent:speaker-2-24-regular", mdi: "mdi:volume-high" },
  Voice: { fluent: "fluent:mic-24-regular", mdi: "mdi:microphone" },
  "Alarms/Timers": { fluent: "fluent:clock-alarm-24-regular", mdi: "mdi:alarm" },
  Announce: { fluent: "fluent:megaphone-loud-24-regular", mdi: "mdi:bullhorn" },
  Cameras: { fluent: "fluent:video-24-regular", mdi: "mdi:cctv" },
  Thermostats: { fluent: "fluent:temperature-24-regular", mdi: "mdi:thermometer" },
  Calendars: { fluent: "fluent:calendar-ltr-24-regular", mdi: "mdi:calendar" },
  Photos: { fluent: "fluent:image-24-regular", mdi: "mdi:image-multiple" },
};

/** The default five navbar sections (matches the bar Ted's Dashboard ships with):
 *  0 = weather · assist, 1/2/3 empty (2 = View Launcher target), 4 = timers · alarms ·
 *  datetime · notifications. Pre-populated so `navbar_sections` renders today's bar out
 *  of the box; users can then edit/remove items in Settings → Navbar. Must match the
 *  backend `SETTINGS_DEFAULTS["navbar_sections"]`. */
export const DEFAULT_NAVBAR_SECTIONS = [
  {
    items: [
      { type: "weather", tap_action: { action: "navigate-dashboard", dashboard: "weather_dashboard" } },
      { type: "assist" },
    ],
  },
  { items: [] },
  { items: [] },
  { items: [] },
  {
    items: [
      { type: "timers" },
      { type: "alarms" },
      {
        type: "datetime",
        display: "both-stacked",
        date_format: "MMMM D",
        time_format: "h:MM a",
        tap_action: { action: "navigate-dashboard", dashboard: "calendar_dashboard" },
        hold_action: { action: "navigate-dashboard", dashboard: "alarms_dashboard" },
      },
      { type: "notifications" },
    ],
  },
];

/** Default values — must match the backend `SETTINGS_DEFAULTS`. */
export const SETTINGS_DEFAULTS: SettingsMap = {
  timer_snooze_enabled: true,
  timer_snooze_minutes: 1,
  timer_alert_sound: "default",
  timer_alert_volume: 60,
  timer_alert_repeat: true,  alarm_snooze_enabled: true,
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
  announce_messages: [],
  announce_tts_engine: null,
  announce_intro_phrase: "Incoming announcement",
  announce_sound: "default",
  announce_volume: 80,
  announce_timeout_default: 30,
  music_player: null,
  music_volume: 5,
  music_auto_expose_device: true,
  music_autoexpose_state: null,
  system_sound_player: null,
  cameras_list: [],
  calendars_list: [],
  calendar_options: {},
  calendar_name: "Family Calendar",
  calendar_view: "month",
  calendar_emphasize_weekdays: true,
  cameras_layout: "big-small",
  vision_enabled: false,
  vision_ai_task_entity: null,
  vision_ai_task_entity_detailed: null,
  vision_two_pass: true,
  vision_cameras: {},
  vision_capture_mode: "video",
  vision_clip_seconds: 10,
  vision_frame_count: 3,
  vision_false_alarm_mode: "log_only",
  vision_retention_max: 200,
  frigate_native_detection: true,
  frigate_notifications: true,
  frigate_controls: true,
  frigate_health: true,
  climate_list: [],
  climate_layout: "auto",
  climate_aliases: [],
  climate_auto_on: false,
  climate_min_delta: 5,
  navbar_auto_hide: false,
  navbar_auto_hide_delay: 5,
  navbar_float: false,
  navbar_position: "bottom",
  navbar_size: 48,
  navbar_menu_items: [],
  navbar_sections: DEFAULT_NAVBAR_SECTIONS as unknown as SettingsValue,
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
  allow_device_area_self_assign: true,
  assist_button_enabled: true,
  continuous_wakeword_enabled: false,
  voice_pipeline: "",
  auto_refresh_on_update: true,
  dashboard_auto_update: true,
  use_kiosk_mode: false,
  kiosk_nudge_dismissed: false,
  icon_set: "auto",
  weather_entity: null,
  night_enabled: false,
  night_schedule_source: "sun_dusk_dawn",
  night_start: "21:00:00",
  night_end: "07:00:00",
  night_dim_brightness: 75,
  night_dim_background: 25,
  night_font_color: "red",
  night_transition_seconds: 30,
  night_dark_mode: true,
  night_brightness_entity: null,
  night_day_snapshot: null,
  // Internal (no Settings field): per-device saved maximized state of Fullscreen
  // cards, keyed by each card's `state_key`. Shape: { [state_key]: boolean }.
  fullscreen_states: {},
  // Per-device profile ({undefined|nightstand|tablet-landscape|tablet-portrait|handheld}).
  // Picking one cascades a preset of navbar/home/fullscreen device settings.
  device_type: null,
  // Visual style for Ted's cards with dashboard_integration (ha | ted-style).
  theme: "ha",
  // Internal (no Settings field): default maximized state for content Fullscreen
  // cards on this device, seeded by the device type. Whitelisted for writes.
  fullscreen_default: false,
  background_mode: "slideshow",
  background_scroll: false,
  background_size: "fill",
  background_align: "center",
  background_repeat: "tile",
  background_color: "#57608E",
  background_gradient: true,
  background_image: null,
  background_recent_images: [],
  background_album: "bing_pod",
  background_folder: null,
  background_type_pref: "match",
  background_shuffle: true,
  background_cycle_minutes: 30,
  background_bing_cache_size: 100,
  background_enhance_readability: true,
  background_readability_strength: 45,
  background_brightness: 75,
  // Photos (Ted's Photo Viewer card + Photos view)
  photos_folder: null,
  photos_auto_open_last: true,
  // Internal (no Settings field): per-device ref of the last opened photo.
  photos_last_viewed: null,
  photos_slideshow_transition: "crossfade",
  photos_slideshow_crossfade_seconds: 2,
  dashboard_root: "ted-dashboard",
  home_dashboard: "[root]/home-welcome",
  alarms_dashboard: "[root]/alarms-timers?tab=alarms",
  timers_dashboard: "[root]/alarms-timers?tab=timers",
  weather_dashboard: "[root]/weather",
  calendar_dashboard: "[root]/calendar-month",
  cameras_dashboard: "[root]/cameras",
  vision_dashboard: "[root]/cameras?tab=vision",
  climate_dashboard: "[root]/climate",
  music_dashboard: "[root]/music",
  photos_dashboard: "[root]/photos",
  assist_response_dashboard: "[root]/assist-response",
  announce_dashboard: "[root]/announce",
  notifications_dashboard: "[root]/notifications",
  settings_dashboard: "[root]/settings",
  auto_return_home_after: 0,
};

export const SETTINGS_FIELDS: SettingField[] = [
  // Sounds
  { key: "system_sound_player", label: "System sounds player", group: "Sounds", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Alarms, timers, alerts & notifications play on this speaker. Set per-device." },
  { key: "do_not_disturb", label: "Do Not Disturb", group: "Sounds", subsection: "Notifications", kind: "boolean", help: "Suppresses toasts and alert sounds on this device." },
  { key: "notification_volume", label: "Sound volume", group: "Sounds", subsection: "Notifications", kind: "percent" },
  { key: "notification_sound", label: "Alert sound (default)", group: "Sounds", subsection: "Notifications", kind: "media", help: "Fallback sound for notifications of any severity." },
  { key: "notification_sound_info", label: "Info sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_success", label: "Success sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_warning", label: "Warning sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_danger", label: "Danger sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_tip", label: "Tip sound", group: "Sounds", subsection: "Notifications", kind: "media", help: "\"default\" uses the fallback above." },
  { key: "music_player", label: "Music player", group: "Sounds", subsection: "Music", kind: "entity", entityDomain: "media_player", entityPlatform: "music_assistant", deviceOnly: true, help: "Music Assistant player for the Music view. Falls back to the system sounds player. Set per-device." },
  { key: "music_auto_expose_device", label: "Auto-set-up this device for music", group: "Sounds", subsection: "Music", kind: "boolean", help: "Automatically make this device a Music Assistant player so it can play music (when Music Assistant runs as the Home Assistant add-on). Turn off to keep this device out of Music Assistant." },
  { key: "music_volume", label: "Music volume", group: "Sounds", subsection: "Music", kind: "percent" },
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
  // Announce
  { key: "announce_messages", label: "Predefined messages", group: "Announce", kind: "announce-messages", help: "The global list of ready-made announcements shown in the Announce view." },
  { key: "announce_tts_engine", label: "Voice (TTS engine)", group: "Announce", subsection: "Voice", kind: "entity", entityDomain: "tts", help: "Text-to-speech engine used to speak announcements. Leave empty to use Home Assistant's default." },
  { key: "announce_intro_phrase", label: "Spoken preface", group: "Announce", subsection: "Voice", kind: "text", help: "Spoken before the announcement's title and message (e.g. \"Incoming announcement\"). Leave blank for none." },
  { key: "announce_volume", label: "Announcement volume", group: "Announce", subsection: "Voice", kind: "percent" },
  { key: "announce_sound", label: "Alert chime", group: "Announce", subsection: "Voice", kind: "media", help: "Sound played with the announcement (and looped, for \"Until dismissed\" ones)." },
  { key: "announce_timeout_default", label: "Announcement timeout", group: "Announce", subsection: "Voice", kind: "number", min: 0, max: 600, unit: "s", help: "How long an announcement stays on screen — and keeps repeating its alert sound — before auto-dismissing. 0 = until dismissed." },
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
  // Vision Analysis — a global-only collapsible subsection at the bottom of the Cameras tab.
  { key: "vision_enabled", label: "Enable Vision Analysis", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "boolean", help: "AI-analyze camera events and log them to the Vision timeline. With Frigate, its own alerts drive analysis; otherwise a camera's detection sensors do." },
  { key: "vision_two_pass", label: "Two-pass analysis", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "boolean", help: "Run a fast first pass for an immediate result, then refine the details with a fuller second pass." },
  { key: "vision_ai_task_entity", label: "AI Task entity — Quick pass", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "entity", entityDomain: "ai_task", help: "AI Task entity for the quick pass. Leave empty to auto-pick an image-capable entity (Ollama, then OpenAI, then Gemini)." },
  { key: "vision_ai_task_entity_detailed", label: "AI Task entity — Detailed pass", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "entity", entityDomain: "ai_task", showWhen: { key: "vision_two_pass", truthy: true }, help: "AI Task entity for the detailed pass. Leave empty to reuse the quick entity when it supports video, else auto-pick a video-capable entity." },
  { key: "vision_ai_task_entity", label: "AI Task entity", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "entity", entityDomain: "ai_task", showWhen: { key: "vision_two_pass", equals: false }, help: "AI Task entity used for analysis. Leave empty to auto-pick an image-capable entity (Ollama, then OpenAI, then Gemini)." },
  { key: "vision_retention_max", label: "Keep events", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "number", min: 10, max: 1000, help: "Maximum number of analyzed events kept (older ones and their files are pruned)." },
  {
    key: "vision_capture_mode",
    label: "Capture",
    group: "Cameras",
    subsection: "Vision Analysis",
    globalOnly: true,
    kind: "select",
    options: [
      { value: "video", label: "Video (record stream)" },
      { value: "clip", label: "Clip (stitched frames)" },
      { value: "burst", label: "Burst snapshots" },
      { value: "snapshot", label: "Single snapshot" },
    ],
    help: "How the event is captured. Video records the real camera stream (falls back to stitched frames if unavailable); clip stitches the captured stills into a short slideshow.",
  },
  { key: "vision_clip_seconds", label: "Capture window", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "number", min: 1, max: 30, unit: "s", help: "Length of the capture window for video/clip/burst modes." },
  { key: "vision_frame_count", label: "Frames analyzed", group: "Cameras", subsection: "Vision Analysis", globalOnly: true, kind: "number", min: 1, max: 8, help: "How many stills across the window are sent to the AI." },
  {
    key: "vision_false_alarm_mode",
    label: "Filter out false alarms",
    group: "Cameras",
    subsection: "Vision Analysis",
    globalOnly: true,
    kind: "select",
    options: [
      { value: "off", label: "Off" },
      { value: "log_only", label: "Log only" },
      { value: "drop", label: "Drop" },
    ],
    help: "When the AI believes an event is a false alarm: Off acts normally; Log only stores it but doesn't fire the trigger's actions; Drop discards it entirely.",
  },
  // Frigate — only relevant when Frigate is the adopted camera source.
  { key: "frigate_native_detection", label: "Use Frigate detection", group: "Cameras", subsection: "Frigate", globalOnly: true, kind: "boolean", help: "Let Frigate drive Vision for its cameras: log its own events using Frigate's thumbnail and clip (no local recording) and run the AI only to describe that clip. Requires the MQTT integration." },
  { key: "frigate_notifications", label: "Frigate alert notifications", group: "Cameras", subsection: "Frigate", globalOnly: true, kind: "boolean", help: "Turn Frigate review alerts into Ted's notifications with the event thumbnail and clip. Requires the MQTT integration." },
  { key: "frigate_controls", label: "Camera controls", group: "Cameras", subsection: "Frigate", kind: "boolean", help: "Show Frigate detect/recordings/snapshots toggles (and a Recordings link) in a Frigate camera's long-press menu on the Cameras view." },
  { key: "frigate_health", label: "Status chips", group: "Cameras", subsection: "Frigate", kind: "boolean", help: "Show Frigate review status and active object counts as chips on a Frigate camera's tile." },
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
  { key: "climate_list", label: "Thermostats", group: "Thermostats", kind: "entity-list", entityDomain: "climate", help: "Global lists the available thermostats; each device curates its own subset. Expand a thermostat to add voice aliases." },
  { key: "climate_auto_on", label: "Auto turn on", group: "Thermostats", kind: "boolean", help: "When a voice climate request targets a thermostat that's off, turn it on automatically instead of asking first." },
  { key: "climate_min_delta", label: "Min heat/cool gap", group: "Thermostats", kind: "number", min: 1, max: 15, unit: "\u00b0", help: "Smallest gap kept between the heat and cool setpoints on heat/cool thermostats." },
  // Photos
  { key: "photos_folder", label: "Album folder", group: "Photos", kind: "folder", help: "Media folder of photos shown on the Photos view. Ted's Photo Viewer card reads this when dashboard_integration is on." },
  { key: "photos_auto_open_last", label: "Re-open last photo", group: "Photos", kind: "boolean", help: "When the Photos view loads, re-open the photo this device last viewed (otherwise it opens empty)." },
  {
    key: "photos_slideshow_transition",
    label: "Slideshow transition",
    group: "Photos",
    kind: "select",
    options: [
      { value: "crossfade", label: "Crossfade" },
      { value: "none", label: "None" },
    ],
    help: "How photos change during an auto-slideshow.",
  },
  { key: "photos_slideshow_crossfade_seconds", label: "Crossfade duration", group: "Photos", kind: "number", min: 0, max: 10, step: 0.5, unit: "s", help: "Length of the crossfade between photos." },
  // Calendars
  { key: "calendar_name", label: "Name", group: "Calendars", kind: "text", help: "Title shown at the top of the calendar. Leave empty for no title." },
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
  { key: "navbar_float", label: "Float", group: "Navbar", kind: "boolean", help: "Detach the bar from its edge with margins and rounded corners (any alignment)." },
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
  { key: "launcher", label: "Launcher Buttons", group: "Navbar", kind: "launcher", help: "Auto-discovered buttons that navigate to this dashboard's views. Shown on navbars with dashboard_integration." },
  { key: "navbar_menu_items", label: "Custom menu items", group: "Navbar", kind: "navbar-menu-items", help: "Extra rows in the navbar's long-press menu (name + icon + action). Shown on navbars with dashboard_integration." },
  { key: "navbar_sections", label: "Navbar sections", group: "Navbar", kind: "navbar-sections", help: "The bar's five positional sections and their items (status items + buttons). Shown on navbars with dashboard_integration." },
  // General
  { key: "device_type", label: "Device type", group: "General", kind: "device-type", deviceOnly: true, help: "A profile for this device that seeds a coherent home view, navbar layout, and fullscreen default in one step." },
  { key: "theme", label: "Theme", group: "General", kind: "select", options: [{ value: "ha", label: "HA Theme" }, { value: "ted-style", label: "Ted's Style" }], help: "Visual style for Ted's cards that have dashboard integration enabled (clock, room, calendar, ...)." },
  { key: "weather_entity", label: "Weather entity", group: "General", kind: "entity", entityDomain: "weather", help: "Default weather entity used by Ted's weather/clock cards that opt in via `dashboard_integration: true`." },
  {
    key: "icon_set",
    label: "Icon set",
    group: "General",
    kind: "select",
    options: [
      { value: "auto", label: "Auto (best installed)" },
      ...ICON_PACKS.map((p) => ({ value: p.prefix, label: p.name })),
    ],
    help: "Which icon family Ted's built-in icons use. Auto picks the best installed set; a specific set falls back to Material Design when an icon isn't available.",
  },
  { key: "night_mode", label: "Automatic night mode", group: "General", kind: "nightmode", help: "Automatically dims the background, lowers screen brightness, and switches to a night font color on a nightly schedule, restoring day values in the morning." },
  { key: "background", label: "Background Wallpaper", group: "General", kind: "background", help: "Dashboard background painted by the invisible ted-background-card." },
  { key: "debug_mode", label: "Debug mode", group: "General", kind: "boolean", subsection: "Advanced", help: "Publishes the --ted-debug CSS variable so dashboards can show layout debug outlines." },
  { key: "allow_device_area_self_assign", label: "Allow un-scoped devices to set their own Area", group: "General", kind: "boolean", subsection: "Advanced", help: "Let a wall-panel (non-admin) account assign its own device to a room when it has none, so voice commands become room-aware. Only applies to devices that currently have no area." },
  { key: "auto_refresh_on_update", label: "Auto-refresh on update", group: "General", kind: "boolean", subsection: "Advanced", help: "Reload this device once automatically when the dashboard is updated, so the new files take effect without a manual refresh." },
  { key: "dashboard_auto_update", label: "Auto-update dashboard files", group: "General", kind: "boolean", subsection: "Advanced", help: "When on, Ted's Dashboard System keeps the installed Ted's Dashboard files up to date automatically. Turn off to pin the current version and manage updates yourself." },
  { key: "use_kiosk_mode", label: "Kiosk mode", group: "General", kind: "boolean", deviceOnly: true, help: "Hide Home Assistant's sidebar, header and edit UI on this device for a clean wall-panel look, using Home Assistant's built-in kiosk mode. Set per-device." },
  // Voice
  { key: "assist_button_enabled", label: "Show push-to-talk mic button", group: "Voice", kind: "boolean", help: "Show a microphone button in the navbar that starts an Assist voice request on tap. Requires the page to be served over HTTPS (needed for microphone access)." },
  { key: "continuous_wakeword_enabled", label: "Enable continuous wake word (experimental)", group: "Voice", kind: "boolean", help: "Listen continuously for the wake word on this device using the browser microphone. Experimental: uses more CPU/battery, needs the page served over HTTPS, and the browser must stay in the foreground. Off by default." },
  { key: "voice_pipeline", label: "Assist pipeline", group: "Voice", kind: "text", subsection: "Advanced", help: "The Assist pipeline id to use for voice on this device. Leave blank to use Home Assistant's preferred pipeline." },
  // Dashboards
  { key: "dashboard_manage", label: "Dashboard views", group: "Dashboards", kind: "dashboard", help: "Customize, add, revert and manage the views on Ted's Dashboard." },
  { key: "auto_return_home_after", label: "Auto-return home after", group: "Dashboards", kind: "number", min: 0, max: 3600, unit: "s", help: "0 = never." },
  { key: "dashboard_root", label: "Dashboard root", group: "Dashboards", kind: "text" },
  { key: "home_dashboard", label: "Home dashboard", group: "Dashboards", kind: "text", rootRelative: true, help: "The view the Home button opens." },
  { key: "alarms_dashboard", label: "Alarms dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "timers_dashboard", label: "Timers dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "weather_dashboard", label: "Weather dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "calendar_dashboard", label: "Calendar dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "cameras_dashboard", label: "Cameras dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "vision_dashboard", label: "Vision dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "climate_dashboard", label: "Climate dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "music_dashboard", label: "Music dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "photos_dashboard", label: "Photos dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "assist_response_dashboard", label: "Assist-Response dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "announce_dashboard", label: "Announce dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "notifications_dashboard", label: "Notifications dashboard", group: "Dashboards", kind: "text", rootRelative: true },
  { key: "settings_dashboard", label: "Settings dashboard", group: "Dashboards", kind: "text", rootRelative: true },
];

/** Fields grouped for the card UI, in declared order per group. */
export function fieldsByGroup(): { group: string; fields: SettingField[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    fields: SETTINGS_FIELDS.filter((f) => f.group === group),
  })).filter((g) => g.fields.length > 0);
}
