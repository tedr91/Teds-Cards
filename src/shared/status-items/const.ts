import type { StatusDisplay, StatusItemType } from "./types";

/** Default icon per status item type. */
export const STATUS_ITEM_DEFAULT_ICON: Record<StatusItemType, string> = {
  temperature: "mdi:thermometer",
  occupancy: "mdi:motion-sensor",
  brightness: "mdi:brightness-6",
  volume: "mdi:volume-high",
  led: "mdi:led-on",
  spacer: "mdi:arrow-expand-horizontal",
  time: "mdi:clock-outline",
  date: "mdi:calendar",
  weather: "mdi:weather-partly-cloudy",
};

/** Human-readable label per status item type (used in editor menus). */
export const STATUS_ITEM_LABEL: Record<StatusItemType, string> = {
  temperature: "Temperature",
  occupancy: "Occupancy",
  brightness: "Brightness control",
  volume: "Volume control",
  led: "Status LED",
  spacer: "Spacer",
  time: "Time",
  date: "Date",
  weather: "Weather",
};

/** Default display mode per status item type (icon + state / icon only / state only). */
export const STATUS_ITEM_DEFAULT_DISPLAY: Record<StatusItemType, StatusDisplay> = {
  temperature: "both",
  occupancy: "both",
  brightness: "icon",
  volume: "icon",
  led: "icon",
  spacer: "both",
  time: "state",
  date: "state",
  weather: "both",
};

/** Status item types offered by the Room Card (a subset of the full set). */
export const ROOM_STATUS_ITEM_TYPES: StatusItemType[] = [
  "temperature",
  "occupancy",
  "brightness",
  "volume",
  "led",
  "spacer",
];

/** Status item types offered by the Navbar Card (the full superset). */
export const NAVBAR_STATUS_ITEM_TYPES: StatusItemType[] = [
  "time",
  "date",
  "weather",
  "temperature",
  "occupancy",
  "brightness",
  "volume",
  "led",
  "spacer",
];

/** MDI icon per Home Assistant weather condition. */
export const WEATHER_ICONS: Record<string, string> = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
  exceptional: "mdi:weather-cloudy-alert",
};

export const DEFAULT_WEATHER_ICON = "mdi:weather-partly-cloudy";

/** Entity states treated as "off / inactive" for status-LED coloring. */
export const OFF_STATES = new Set([
  "off",
  "unavailable",
  "unknown",
  "closed",
  "idle",
  "standby",
  "false",
  "no",
  "0",
  "",
]);

/**
 * media_player states where the volume control is inert (the player is off).
 * Note `idle` counts as ON (e.g. an AVR powered on but not playing).
 */
export const VOLUME_OFF_STATES = new Set(["off", "standby", "unavailable", "unknown", ""]);

/** Delay used to distinguish a single tap (open volume slider) from a double tap (mute). */
export const VOLUME_DOUBLE_TAP_MS = 220;

/** Default spacer width in px. */
export const DEFAULT_SPACER_SIZE = 24;
