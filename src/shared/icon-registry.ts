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

export type IconKey =
  | "account"
  | "device"
  | "location"
  | "server"
  | "requirements"
  | "web"
  | "weather"
  | "speaker"
  | "music"
  | "music-off"
  | "settings"
  | "thermostat"
  | "camera"
  | "check-circle"
  | "alert-circle"
  | "error-circle"
  | "help-circle";

export const SEMANTIC_ICONS: Record<IconKey, IconNames> = {
  account: { mdi: "account", fluent: "person-24-regular" },
  device: { mdi: "devices", fluent: "phone-tablet-24-regular", "streamline-ultimate-color": "tablet" },
  location: { mdi: "map-marker", fluent: "location-24-regular" },
  server: { mdi: "server-network", fluent: "server-24-regular" },
  requirements: { mdi: "clipboard-check-outline", fluent: "clipboard-checkmark-24-regular" },
  web: { mdi: "web", fluent: "globe-24-regular" },
  weather: {
    mdi: "weather-partly-cloudy",
    fluent: "weather-partly-cloudy-day-24-regular",
    "streamline-ultimate-color": "rain-umbrella-sun",
  },
  speaker: { mdi: "speaker", fluent: "speaker-2-24-regular" },
  music: {
    mdi: "music",
    fluent: "music-note-2-24-regular",
    "streamline-ultimate-color": "music-note-1",
  },
  "music-off": { mdi: "music-note-off" },
  settings: { mdi: "cog", fluent: "settings-24-regular", "streamline-ultimate-color": "cog" },
  thermostat: {
    mdi: "thermostat",
    fluent: "temperature-24-regular",
    "streamline-ultimate-color": "temperature-thermometer-high",
  },
  camera: { mdi: "cctv", fluent: "video-24-regular", "streamline-ultimate-color": "shield-monitor" },
  "check-circle": { mdi: "check-circle", fluent: "checkmark-circle-24-filled" },
  "alert-circle": { mdi: "alert-circle", fluent: "warning-24-filled" },
  "error-circle": { mdi: "close-octagon", fluent: "dismiss-circle-24-filled" },
  "help-circle": { mdi: "help-circle", fluent: "question-circle-24-filled" },
};
