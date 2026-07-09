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
  /** Root-relative dashboard path: rendered with a fixed `<dashboard_root>/` prefix,
   *  stored as `[root]/<segment>` (so the value stays root-portable). */
  rootRelative?: boolean;
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
  media_player: null,
  media_player_volume: 50,
  do_not_disturb: false,
  dashboard_root: "ted-dashboard",
  home_dashboard: "[root]/welcome",
  alarms_dashboard: "[root]/alarms-timers?tab=alarms",
  timers_dashboard: "[root]/alarms-timers?tab=timers",
  auto_return_home_after: 0,
};

export const SETTINGS_FIELDS: SettingField[] = [
  // Timers
  { key: "timer_snooze_enabled", label: "Enable snoozing", group: "Timers", kind: "boolean" },
  { key: "timer_snooze_minutes", label: "Snooze duration", group: "Timers", kind: "number", min: 1, max: 60, unit: "min" },
  { key: "timer_alert_sound", label: "Alert sound", group: "Timers", kind: "media", help: "Leave empty for the bundled sound, or enter a media URL." },
  { key: "timer_alert_volume", label: "Alert volume", group: "Timers", kind: "percent" },
  { key: "timer_alert_repeat", label: "Repeat alert", group: "Timers", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  // Alarms
  { key: "alarm_snooze_enabled", label: "Enable snoozing", group: "Alarms", kind: "boolean" },
  { key: "alarm_snooze_minutes", label: "Snooze duration", group: "Alarms", kind: "number", min: 1, max: 60, unit: "min" },
  { key: "alarm_alert_sound", label: "Alert sound", group: "Alarms", kind: "media" },
  { key: "alarm_alert_volume", label: "Alert volume", group: "Alarms", kind: "percent" },
  { key: "alarm_alert_repeat", label: "Repeat alert", group: "Alarms", kind: "boolean", help: "Loop the sound until dismissed (or the notification times out)." },
  // Notifications
  { key: "notification_sound", label: "Alert sound (default)", group: "Notifications", kind: "media", help: "Fallback sound for notifications of any severity." },
  { key: "notification_volume", label: "Sound volume", group: "Notifications", kind: "percent" },
  { key: "notification_sound_info", label: "Info sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_success", label: "Success sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_warning", label: "Warning sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_danger", label: "Danger sound", group: "Notifications", kind: "media", help: "Leave empty to use the fallback above." },
  { key: "notification_sound_tip", label: "Tip sound", group: "Notifications", kind: "media", help: "\"default\" uses the fallback above." },
  // Media
  { key: "media_player", label: "Media player", group: "Media", kind: "entity", entityDomain: "media_player", deviceOnly: true, help: "Speaker used for notifications, alarms, timers, music. Set per-device." },
  { key: "media_player_volume", label: "Media volume", group: "Media", kind: "percent" },
  // General
  { key: "do_not_disturb", label: "Do Not Disturb", group: "General", kind: "boolean", help: "Suppresses toasts and alert sounds on this device." },
  // Navigation
  { key: "dashboard_root", label: "Dashboard root", group: "Navigation", kind: "text" },
  { key: "home_dashboard", label: "Home dashboard", group: "Navigation", kind: "text", rootRelative: true, help: "The view the Home button opens." },
  { key: "alarms_dashboard", label: "Alarms dashboard", group: "Navigation", kind: "text", rootRelative: true, help: "Where the Alarms status item navigates on tap." },
  { key: "timers_dashboard", label: "Timers dashboard", group: "Navigation", kind: "text", rootRelative: true, help: "Where the Timers status item navigates on tap." },
  { key: "auto_return_home_after", label: "Auto-return home after", group: "Navigation", kind: "number", min: 0, max: 3600, unit: "s", help: "0 = never." },
];

/** Fields grouped for the card UI, in declared order per group. */
export function fieldsByGroup(): { group: string; fields: SettingField[] }[] {
  return SETTINGS_GROUPS.map((group) => ({
    group,
    fields: SETTINGS_FIELDS.filter((f) => f.group === group),
  })).filter((g) => g.fields.length > 0);
}
