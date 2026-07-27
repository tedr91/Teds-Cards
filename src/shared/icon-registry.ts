/**
 * Semantic icon registry — a single source of truth mapping Ted's *internal* icon
 * keys to the equivalent name in each icon set. Icon names are rarely 1:1 across
 * families (mdi `account` vs fluent `person-24-regular`), so this table reconciles
 * them; the resolver ({@link ../shared/icons#themedIcon}) then picks the name for
 * the user's configured `icon_set` (or the best installed set on `auto`).
 *
 * Every key MUST include an `mdi` name (mdi ships with HA core, so it's the
 * guaranteed fallback). Other sets are optional and expanded over time; a missing
 * set entry simply falls back through the availability priority to mdi.
 *
 * Names here are WITHOUT the set prefix (the resolver adds `set:name`).
 */

/** An icon set prefix → icon name (no prefix). `mdi` is required per entry. */
export type IconNames = { mdi: string } & Record<string, string>;

/**
 * DB "A" — the supported icon packs: a unique display `name` + the `prefix` used in
 * `prefix:name` icon strings. Ordered most-preferred first (this IS the resolver's
 * priority). `mdi` ships with HA core, is always available, and is the guaranteed
 * final fallback, so it comes last. The Settings "Icon set" dropdown and
 * {@link ../shared/icons#ICON_SET_PRIORITY} are both derived from this table.
 */
export interface IconPack {
  /** Unique, human-readable name shown in Settings. */
  name: string;
  /** The icon set prefix used in icon strings (e.g. `mdi` in `mdi:home`). */
  prefix: string;
}

export const ICON_PACKS: readonly IconPack[] = [
  { name: "Streamline Ultimate", prefix: "streamline-ultimate-color" },
  { name: "Streamline Freehand", prefix: "streamline-freehand-color" },
  { name: "Pepicons", prefix: "pepicons-print" },
  { name: "Fluent", prefix: "fluent" },
  { name: "Material Design (MDI)", prefix: "mdi" },
];

export type IconKey =
  | "account"
  | "device"
  | "location"
  | "server"
  | "requirements"
  | "web"
  | "weather"
  | "weather-night"
  | "speaker"
  | "music"
  | "music-off"
  | "settings"
  | "thermostat"
  | "camera"
  | "calendar"
  | "calendar-off"
  | "cake"
  // View / navigation icons (dashboard view headers + navbar launcher)
  | "home"
  | "home-handheld"
  | "home-wallpanel-h"
  | "home-wallpanel-v"
  | "alarms-timers"
  | "announce"
  | "assist-response"
  | "calendar-week"
  | "notifications"
  | "photos"
  | "check-circle"
  | "alert-circle"
  | "error-circle"
  | "help-circle";

export const SEMANTIC_ICONS: Record<IconKey, IconNames> = {
  // Pack names below are sourced from Iconify (icon-sets.iconify.design). The Fluent
  // names on the view keys are BEST-GUESSES (Fluent wasn't installed to verify). A key
  // with no entry for a pack is a real gap — the resolver falls through priority to MDI.
  account: { mdi: "account", fluent: "person-24-regular", "streamline-ultimate-color": "single-neutral-circle", "streamline-freehand-color": "face-id-male-1", "pepicons-print": "person" },
  device: { mdi: "devices", fluent: "phone-tablet-24-regular", "streamline-ultimate-color": "tablet", "streamline-freehand-color": "tablet-application", "pepicons-print": "smartphone-home-button" },
  location: { mdi: "map-marker", fluent: "location-24-regular", "streamline-ultimate-color": "earth-pin-2", "streamline-freehand-color": "worldwide-web-location-pin", "pepicons-print": "pinpoint" },
  server: { mdi: "server-network", fluent: "server-24-regular", "streamline-ultimate-color": "database-2", "streamline-freehand-color": "server-2", "pepicons-print": "database" },
  requirements: { mdi: "clipboard-check-outline", fluent: "clipboard-checkmark-24-regular", "streamline-ultimate-color": "checklist", "streamline-freehand-color": "form-edition-clipboard-check", "pepicons-print": "clipboard-check" },
  web: { mdi: "web", fluent: "globe-24-regular", "streamline-ultimate-color": "network-browser", "streamline-freehand-color": "worldwide-web-network-www", "pepicons-print": "internet" },
  weather: { mdi: "weather-partly-cloudy", fluent: "weather-partly-cloudy-day-24-regular", "streamline-ultimate-color": "rain-umbrella-sun", "streamline-freehand-color": "cloud-data-transfer", "pepicons-print": "cloud" },
  "weather-night": { mdi: "weather-night", fluent: "weather-moon-24-regular", "streamline-ultimate-color": "night-moon-half-1", "streamline-freehand-color": "light-mode-night-architecture", "pepicons-print": "moon" },
  speaker: { mdi: "speaker", fluent: "speaker-2-24-regular", "streamline-ultimate-color": "speaker-1", "streamline-freehand-color": "speaker", "pepicons-print": "speaker-high" },
  music: { mdi: "music", fluent: "music-note-2-24-regular", "streamline-ultimate-color": "music-note-1", "streamline-freehand-color": "music-note-1", "pepicons-print": "music-note-double" },
  "music-off": { mdi: "music-note-off", fluent: "music-note-off-2-24-regular", "streamline-ultimate-color": "volume-control-remove-1", "streamline-freehand-color": "music-note-circle-block-1", "pepicons-print": "music-note-double-off" },
  settings: { mdi: "cog", fluent: "settings-24-regular", "streamline-ultimate-color": "cog", "streamline-freehand-color": "settings-cog", "pepicons-print": "gear" },
  thermostat: { mdi: "thermostat", fluent: "temperature-24-regular", "streamline-ultimate-color": "temperature-thermometer-high", "streamline-freehand-color": "amusement-park-strength-meter", "pepicons-print": "seedling" },
  camera: { mdi: "cctv", fluent: "video-24-regular", "streamline-ultimate-color": "go-pro", "streamline-freehand-color": "camera-stabilizer", "pepicons-print": "camera" },
  calendar: { mdi: "calendar-month", fluent: "calendar-ltr-24-regular", "streamline-ultimate-color": "calendar-1", "streamline-freehand-color": "calendar-grid", "pepicons-print": "calendar" },
  "calendar-off": { mdi: "calendar-remove", fluent: "calendar-cancel-24-regular", "streamline-ultimate-color": "smiley-mad", "streamline-freehand-color": "desktop-action-monitor-remove", "pepicons-print": "calendar-off" },
  cake: { mdi: "cake-variant", fluent: "food-cake-24-regular", "streamline-ultimate-color": "gift-box-1", "streamline-freehand-color": "party-balloon", "pepicons-print": "gift" },
  // View / navigation icons — authored as mdi:* in the dashboard YAML (so native HA
  // surfaces render); the navbar launcher upgrades them to the best-installed pack.
  home: { mdi: "home", fluent: "home-24-regular", "streamline-ultimate-color": "house-chimney", "streamline-freehand-color": "home-chimney-2", "pepicons-print": "house" },
  "home-handheld": { mdi: "home", fluent: "home-24-regular", "streamline-ultimate-color": "house-chimney", "streamline-freehand-color": "home-chimney-2", "pepicons-print": "house" },
  "home-wallpanel-h": { mdi: "home", fluent: "home-24-regular", "streamline-ultimate-color": "house-chimney", "streamline-freehand-color": "home-chimney-2", "pepicons-print": "house" },
  "home-wallpanel-v": { mdi: "home", fluent: "home-24-regular", "streamline-ultimate-color": "house-chimney", "streamline-freehand-color": "home-chimney-2", "pepicons-print": "house" },
  "alarms-timers": { mdi: "alarm-multiple", fluent: "clock-alarm-24-regular", "streamline-ultimate-color": "time-clock-circle", "streamline-freehand-color": "alert-alarm-clock", "pepicons-print": "alarm" },
  announce: { mdi: "bullhorn", fluent: "megaphone-loud-24-regular", "streamline-ultimate-color": "megaphone", "streamline-freehand-color": "share-megaphone", "pepicons-print": "megaphone" },
  "assist-response": { mdi: "message-text", fluent: "chat-24-regular", "streamline-ultimate-color": "messages-bubble-square-typing-1", "streamline-freehand-color": "conversation-chat", "pepicons-print": "text-bubble" },
  "calendar-week": { mdi: "calendar-week", fluent: "calendar-date-24-regular", "streamline-ultimate-color": "calendar-date", "streamline-freehand-color": "calendar-date", "pepicons-print": "calendar" },
  notifications: { mdi: "bell-ring", fluent: "alert-24-regular", "streamline-ultimate-color": "alarm-bell-ring", "streamline-freehand-color": "alert-alarm-bell", "pepicons-print": "bell" },
  photos: { mdi: "image-multiple", fluent: "image-24-regular", "streamline-ultimate-color": "picture-sun", "streamline-freehand-color": "picture-stack-landscape", "pepicons-print": "photo" },
  "check-circle": { mdi: "check-circle", fluent: "checkmark-circle-24-filled", "streamline-ultimate-color": "check-badge", "streamline-freehand-color": "form-validation-check-square-1", "pepicons-print": "checkmark-circle" },
  "alert-circle": { mdi: "alert-circle", fluent: "warning-24-filled", "streamline-ultimate-color": "car-dashboard-warning", "streamline-freehand-color": "alerts-warning-triangle", "pepicons-print": "exclamation-circle" },
  "error-circle": { mdi: "close-octagon", fluent: "dismiss-circle-24-filled", "streamline-ultimate-color": "delete-2", "streamline-freehand-color": "form-validation-remove-square", "pepicons-print": "times-circle" },
  "help-circle": { mdi: "help-circle", fluent: "question-circle-24-filled", "streamline-ultimate-color": "help-question-network", "streamline-freehand-color": "help-question-circle", "pepicons-print": "question-circle" },
};
