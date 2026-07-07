/**
 * The Ted's Cards settings schema — a single source of truth for the field list,
 * types, defaults, and grouping used by the Settings card. Keys and default values
 * MUST stay in sync with the backend's `SETTINGS_DEFAULTS` in `const.py`.
 */

export type SettingsValue = boolean | number | string | null;
export type SettingsMap = Record<string, SettingsValue>;

/** How a setting is edited / rendered in the Settings card. */
export type SettingKind = "boolean" | "number" | "percent" | "text" | "entity" | "media";

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
  /** For `entity` fields, restrict the picker to this domain (e.g. media_player). */
  entityDomain?: string;
  /** Only meaningful per-device (no sensible global value) — greyed out in the Global tab. */
  deviceOnly?: boolean;
}

export const SETTINGS_GROUPS = [
  "Timers",
  "Alarms",
  "Notifications",
  "Media",
  "General",
  "Navigation",
] as const;

/** Default values — must match the backend `SETTINGS_DEFAULTS`. */
export const SETTINGS_DEFAULTS: SettingsMap = {
  timer_snooze_enabled: true,
  timer_snooze_minutes: 1,
  timer_alert_sound: "default",
  timer_alert_volume: 60,
  timer_alert_repeat: true,
  timer_alert_max_repeats: 10,
  alarm_snooze_enabled: true,
  alarm_snooze_minutes: 9,
  alarm_alert_sound: "default",
  alarm_alert_volume: 70,
  alarm_alert_repeat: true,
  alarm_alert_max_repeats: 10,
  notification_sound: "default",
  notification_volume: 50,
  media_player: null,
  media_player_volume: 50,
  do_not_disturb: false,
  dashboard_root: "ted-dashboard",
  home_dashboard: "[root]/home-tablet",
  auto_return_home_after: 30,
};

export const SETTINGS_FIELDS: SettingField[] = [
  // Timers
  { key: "timer_snooze_enabled", label: "Enable snoozing", group: "Timers", kind: "boolean" },
  { key: "timer_snooze_minutes", label: "Snooze duration", group: "Timers", kind: "number", min: 1, max: 60, unit: "min" },
  { key: "timer_alert_sound", label: "Alert sound", group: "Timers", kind: "media", help: "\"default\" uses the bundled sound; or a media URL." },
  { key: "timer_alert_volume", label: "Alert volume", group: "Timers", kind: "percent" },
  { key: "timer_alert_repeat", label: "Repeat alert", group: "Timers", kind: "boolean" },
  { key: "timer_alert_max_repeats", label: "Max repeats", group: "Timers", kind: "number", min: 1, max: 100 },
  // Alarms
  { key: "alarm_snooze_enabled", label: "Enable snoozing", group: "Alarms", kind: "boolean" },
  { key: "alarm_snooze_minutes", label: "Snooze duration", group: "Alarms", kind: "number", min: 1, max: 60, unit: "min" },
  { key: "alarm_alert_sound", label: "Alert sound", group: "Alarms", kind: "media" },
  { key: "alarm_alert_volume", label: "Alert volume", group: "Alarms", kind: "percent" },
  { key: "alarm_alert_repeat", label: "Repeat alert", group: "Alarms", kind: "boolean" },
  { key: "alarm_alert_max_repeats", label: "Max repeats", group: "Alarms", kind: "number", min: 1, max: 100 },
  // Notifications
  { key: "notification_sound", label: "Alert sound", group: "Notifications", kind: "media" },
  { key: "notification_volume", label: "Sound volume", group: "Notifications", kind: "percent" },
  // Media
  { key: "media_player", label: "Media player", group: "Media", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Speaker used for notifications, alarms, timers, music. Set per-device." },
  { key: "media_player_volume", label: "Media volume", group: "Media", kind: "percent" },
  // General
  { key: "do_not_disturb", label: "Do Not Disturb", group: "General", kind: "boolean", help: "Suppresses toasts and alert sounds on this device." },
  // Navigation
  { key: "dashboard_root", label: "Dashboard root", group: "Navigation", kind: "text" },
  { key: "home_dashboard", label: "Home dashboard", group: "Navigation", kind: "text", help: "Use [root] for the dashboard root, e.g. [root]/home-tablet." },
  { key: "auto_return_home_after", label: "Auto-return home after", group: "Navigation", kind: "number", min: 0, max: 3600, unit: "s", help: "0 = never." },
];

/** Fields grouped for the card UI, in declared order per group. */
export function fieldsByGroup(): { group: string; fields: SettingField[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    fields: SETTINGS_FIELDS.filter((f) => f.group === group),
  })).filter((g) => g.fields.length > 0);
}
