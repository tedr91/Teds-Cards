/**
 * Device types — a per-device "profile" that seeds a coherent set of dashboard
 * settings (home view, navbar layout, fullscreen default) in one action.
 *
 * Picking a type performs a ONE-TIME preset cascade: it writes `device_type`
 * plus each preset key at the DEVICE scope. The individual settings can still be
 * tweaked afterward without being reverted — the type is a starting point, not a
 * live override. `device_type` itself is stored so future features (e.g. launcher
 * button filtering) can key off it.
 */

import { FULLSCREEN_STATES_KEY } from "../cards/fullscreen-card/const";
import { DEFAULT_NAVBAR_SECTIONS, SETTINGS_DEFAULTS, type SettingsValue } from "./settings-schema";
import { settingsStore } from "./settings";

/** The set of device profiles. `undefined` = no profile applied. */
export type DeviceType =
  | "nightstand"
  | "tablet-landscape"
  | "tablet-portrait"
  | "handheld";

/** The device-scope settings a device type seeds. */
export interface DeviceTypePreset {
  home_dashboard: string;
  navbar_position: "bottom" | "top" | "left" | "right";
  navbar_auto_hide: boolean;
  navbar_size: number;
  navbar_float: boolean;
  /** Default maximized state for content `ted-fullscreen-card`s on this device. */
  fullscreen_default: boolean;
  /** Whether this device type opts into night screen-dimming (only nightstands). */
  night_screen_auto: boolean;
  /** Whether this device type opts into the night font-color shift (only nightstands). */
  night_font_shift: boolean;
  /** Curated View Launcher subset (view paths) for this device, if the type limits it.
   *  Omitted = the device inherits the global launcher list (all views). */
  launcher_list?: string[];
  /** Explicit navbar sections for this device, if the type reshapes the bar (e.g. the
   *  nightstand hides everything but the Center/launcher section). Omitted = inherit. */
  navbar_sections?: unknown[];
}

/** The nightstand navbar: every section (including Left and Right) stays enabled, but
 *  the weather and clock (datetime) status items are removed since the nightstand Home
 *  view already shows the time. */
const NIGHTSTAND_NAVBAR_SECTIONS = DEFAULT_NAVBAR_SECTIONS.map((section) => ({
  ...section,
  items: (section.items ?? []).filter((item) => item.type !== "weather" && item.type !== "datetime"),
}));

/** The portrait-tablet navbar: the default bar with the weather and clock (datetime)
 *  items removed, since the portrait Home view already shows a clock and calendar. */
const TABLET_PORTRAIT_NAVBAR_SECTIONS = DEFAULT_NAVBAR_SECTIONS.map((section) => ({
  ...section,
  items: (section.items ?? []).filter((item) => item.type !== "weather" && item.type !== "datetime"),
}));

/** The preset values written when each type is applied. */
export const DEVICE_TYPE_PRESETS: Record<DeviceType, DeviceTypePreset> = {
  nightstand: {
    home_dashboard: "[root]/home-nightstand",
    navbar_position: "right",
    navbar_auto_hide: false,
    navbar_size: 56,
    navbar_float: false,
    fullscreen_default: true,
    night_screen_auto: true,
    night_font_shift: true,
    // A minimal bar: only Home, Music, and Alarms/Timers launcher buttons, with the
    // weather and datetime status items removed from the (still-enabled) sections.
    launcher_list: ["home-nightstand", "music", "alarms-timers"],
    navbar_sections: NIGHTSTAND_NAVBAR_SECTIONS,
  },
  "tablet-landscape": {
    home_dashboard: "[root]/home-wallpanel-h",
    navbar_position: "bottom",
    navbar_auto_hide: true,
    navbar_size: 52,
    navbar_float: false,
    fullscreen_default: false,
    night_screen_auto: false,
    night_font_shift: false,
  },
  "tablet-portrait": {
    home_dashboard: "[root]/home-wallpanel-v",
    navbar_position: "bottom",
    navbar_auto_hide: false,
    navbar_size: 52,
    navbar_float: false,
    fullscreen_default: false,
    night_screen_auto: false,
    night_font_shift: false,
    navbar_sections: TABLET_PORTRAIT_NAVBAR_SECTIONS,
  },
  handheld: {
    home_dashboard: "[root]/home-handheld",
    navbar_position: "bottom",
    navbar_auto_hide: true,
    navbar_size: 56,
    navbar_float: true,
    fullscreen_default: true,
    night_screen_auto: false,
    night_font_shift: false,
  },
};

/** Human-readable labels + the "not set" option for pickers. */
export const DEVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "nightstand", label: "Nightstand" },
  { value: "tablet-landscape", label: "Tablet — Landscape" },
  { value: "tablet-portrait", label: "Tablet — Portrait" },
  { value: "handheld", label: "Handheld" },
];

/** The display label for a device type (or "Not set"). */
export function deviceTypeLabel(type: string | null | undefined): string {
  return DEVICE_TYPE_OPTIONS.find((o) => o.value === (type ?? ""))?.label ?? "Not set";
}

/** Narrow an arbitrary value to a known `DeviceType` (else null). */
export function asDeviceType(value: unknown): DeviceType | null {
  return typeof value === "string" && value in DEVICE_TYPE_PRESETS
    ? (value as DeviceType)
    : null;
}

/**
 * Apply a device type at the DEVICE scope: store `device_type` and cascade each
 * preset value. Also clears the per-card `fullscreen_states` map so the new
 * `fullscreen_default` takes effect immediately (any prior manual maximize state
 * is discarded). Passing `null`/"" un-types the device: it clears the `device_type`
 * marker AND the preset overrides it seeded, so the device returns to the untyped
 * defaults (its home dashboard falls back to the Welcome view).
 */
export function applyDeviceType(
  store: typeof settingsStore,
  type: DeviceType | null,
): void {
  if (!type) {
    // Un-type: clear the marker + every key a preset seeds, so the device inherits
    // the defaults again (home_dashboard → the Welcome view).
    for (const key of [
      "device_type",
      "home_dashboard",
      "navbar_position",
      "navbar_auto_hide",
      "navbar_size",
      "navbar_float",
      "fullscreen_default",
      "night_screen_auto",
      "night_font_shift",
      "launcher_list",
      "navbar_sections",
      FULLSCREEN_STATES_KEY,
    ]) {
      store.clearValue("device", key);
    }
    return;
  }
  const preset = DEVICE_TYPE_PRESETS[type];
  store.setValue("device", "device_type", type);
  store.setValue("device", "home_dashboard", preset.home_dashboard);
  store.setValue("device", "navbar_position", preset.navbar_position);
  store.setValue("device", "navbar_auto_hide", preset.navbar_auto_hide);
  store.setValue("device", "navbar_size", preset.navbar_size);
  store.setValue("device", "navbar_float", preset.navbar_float);
  store.setValue("device", "fullscreen_default", preset.fullscreen_default);
  store.setValue("device", "night_screen_auto", preset.night_screen_auto);
  store.setValue("device", "night_font_shift", preset.night_font_shift);
  // Launcher subset + navbar section layout — only some types reshape these; clear the
  // device override for types that don't, so they inherit the global bar.
  if (preset.launcher_list) store.setValue("device", "launcher_list", preset.launcher_list);
  else store.clearValue("device", "launcher_list");
  if (preset.navbar_sections)
    store.setValue("device", "navbar_sections", preset.navbar_sections as unknown as SettingsValue);
  else store.clearValue("device", "navbar_sections");
  // Discard any per-card maximized overrides so the new default is what shows.
  store.setValue("device", FULLSCREEN_STATES_KEY, {});
}

/**
 * Suggest a device type from the current viewport (orientation + size), mirroring
 * the media queries used by the Welcome view's home-layout tips. Returns null when
 * nothing matches confidently.
 */
export function suggestDeviceType(): DeviceType | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  const match = (q: string): boolean => window.matchMedia(q).matches;
  if (match("(orientation: portrait) and (max-width: 600px)")) return "handheld";
  if (match("(orientation: landscape) and (max-height: 600px)")) return "nightstand";
  if (match("(orientation: landscape) and (min-height: 601px)")) return "tablet-landscape";
  if (match("(orientation: portrait) and (min-width: 601px)")) return "tablet-portrait";
  return null;
}

/** Strip a root-relative dashboard path (`[root]/home-x`) down to its view path (`home-x`). */
function stripRoot(value: string): string {
  return value.replace(/^\[root\]\/?/, "");
}

/** Each device type's matching home-view path (e.g. `nightstand` → `home-nightstand`). */
export const DEVICE_TYPE_HOME_PATHS: Record<DeviceType, string> = {
  nightstand: stripRoot(DEVICE_TYPE_PRESETS.nightstand.home_dashboard),
  "tablet-landscape": stripRoot(DEVICE_TYPE_PRESETS["tablet-landscape"].home_dashboard),
  "tablet-portrait": stripRoot(DEVICE_TYPE_PRESETS["tablet-portrait"].home_dashboard),
  handheld: stripRoot(DEVICE_TYPE_PRESETS.handheld.home_dashboard),
};

/** The Welcome view's path (the default `home_dashboard`), e.g. `home-welcome`. */
export const WELCOME_HOME_PATH = stripRoot(String(SETTINGS_DEFAULTS.home_dashboard ?? ""));

/**
 * Whether a launcher view should be HIDDEN for the current device type:
 * - the Welcome view shows only on un-typed devices (hidden once a type is set);
 * - a device-type home view is hidden on a typed device unless it matches that type;
 * - every other view is always shown.
 */
export function launcherHomeHiddenForType(
  path: string,
  deviceType: DeviceType | null,
): boolean {
  if (path === WELCOME_HOME_PATH) return deviceType !== null;
  const isTypeHome = Object.values(DEVICE_TYPE_HOME_PATHS).includes(path);
  if (isTypeHome && deviceType) return path !== DEVICE_TYPE_HOME_PATHS[deviceType];
  return false;
}

