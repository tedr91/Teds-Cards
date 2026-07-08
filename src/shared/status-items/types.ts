/**
 * Shared "status item" model: small read-outs / mini-controls that sit in a
 * strip (Room Card status bar, Navbar Card sections). The Room Card uses the
 * subset {temperature, occupancy, brightness, volume, led, spacer}; the Navbar
 * additionally offers {time, date, weather}.
 */

import type { Condition } from "../conditions";

/** Every status-item kind across all hosts. */
export type StatusItemType =
  | "temperature"
  | "occupancy"
  | "brightness"
  | "volume"
  | "led"
  | "spacer"
  | "datetime"
  | "weather"
  | "notifications"
  | "alarms"
  | "timers";

/** How a status item displays: icon + state, just the icon, or just the state. */
export type StatusDisplay = "both" | "icon" | "state";

/** Fields shared by every status item. */
export interface StatusItemBase {
  type: StatusItemType;
  /** Optional label (tooltip / a11y); falls back to the entity's friendly name. */
  name?: string;
  /** Icon + state, icon only, or state only. Defaults per type. Unused by spacer. */
  display?: StatusDisplay;
  /** Hide the item outright (default true = shown). Honoured by the Navbar Card. */
  visible?: boolean;
  /** Conditions (HA-style + `view-assist`) that gate visibility. Honoured by the Navbar Card. */
  visibility?: Condition[];
}

/**
 * Temperature / occupancy: an icon plus the entity's value. `entity` is optional —
 * the Room Card resolves it from the card's `area` when omitted.
 */
export interface SensorStatusItem extends StatusItemBase {
  type: "temperature" | "occupancy";
  entity?: string;
  icon?: string;
}

/**
 * Brightness slider. Targets a light (on/off + brightness %) or a
 * number / input_number entity (min/max/step → set_value), auto-detected by domain.
 */
export interface BrightnessStatusItem extends StatusItemBase {
  type: "brightness";
  entity: string;
  icon?: string;
}

/** Volume control: tap opens a slider, double-tap mutes. Targets a media_player. */
export interface VolumeStatusItem extends StatusItemBase {
  type: "volume";
  entity: string;
  icon?: string;
}

/**
 * Status LED: a small colored dot. On/active = green, off = grey by default;
 * `on_color`/`off_color` override those, and `colors` maps specific states to colors.
 */
export interface LedStatusItem extends StatusItemBase {
  type: "led";
  entity: string;
  on_color?: string;
  off_color?: string;
  colors?: Record<string, string>;
}

/** A transparent fixed-width gap in the strip. */
export interface SpacerStatusItem extends StatusItemBase {
  type: "spacer";
  /** Width of the gap in px. Defaults to 24. */
  size?: number;
}

/** Current time, optionally with a clock icon. */
export interface DateTimeStatusItem extends Omit<StatusItemBase, "display"> {
  type: "datetime";
  /** Which parts to show: both, time only, or date only. Defaults to "both". */
  display?: "both" | "time" | "date";
  /** Date token format (default "ddd, MMMM D"). */
  date_format?: string;
  /** Time token format (default "h:MM a"). */
  time_format?: string;
}

/** Current weather: condition icon + temperature. `entity` defaults to the first weather.* entity. */
export interface WeatherStatusItem extends StatusItemBase {
  type: "weather";
  entity?: string;
  icon?: string;
}

/** A bell with an unread badge; tapping opens a popover list of notifications. */
export interface NotificationsStatusItem extends StatusItemBase {
  type: "notifications";
  icon?: string;
  /** Only count/show notifications for this area (unset = all). */
  area?: string;
  /** Hide the bell entirely when there are no notifications. Defaults to true. */
  hide_when_empty?: boolean;
  /** Show the numeric count bubble over the icon. Defaults to true. */
  display_badge?: boolean;
}

/** An icon with a badge showing the number of enabled alarms in scope. */
export interface AlarmsStatusItem extends StatusItemBase {
  type: "alarms";
  icon?: string;
  /** Only count alarms for this area (unset = all). */
  area?: string;
  /** Hide the item entirely when no alarms are set. Defaults to true. */
  hide_when_empty?: boolean;
  /** Show the numeric count bubble over the icon. Defaults to true. */
  display_badge?: boolean;
}

/** An icon with a badge showing the number of active timers in scope. */
export interface TimersStatusItem extends StatusItemBase {
  type: "timers";
  icon?: string;
  /** Only count timers for this area (unset = all). */
  area?: string;
  /** Hide the item entirely when no timers are set. Defaults to true. */
  hide_when_empty?: boolean;
  /** Show the numeric count bubble over the icon. Defaults to true. */
  display_badge?: boolean;
}

export type StatusItem =
  | SensorStatusItem
  | BrightnessStatusItem
  | VolumeStatusItem
  | LedStatusItem
  | SpacerStatusItem
  | DateTimeStatusItem
  | WeatherStatusItem
  | NotificationsStatusItem
  | AlarmsStatusItem
  | TimersStatusItem;

/** Resolved slider bounds + current value for a brightness / volume control. */
export interface SliderModel {
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  kind: "light" | "number" | "volume";
  muted: boolean;
  available: boolean;
}
