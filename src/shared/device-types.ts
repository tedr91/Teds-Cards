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
}

/** The preset values written when each type is applied. */
export const DEVICE_TYPE_PRESETS: Record<DeviceType, DeviceTypePreset> = {
  nightstand: {
    home_dashboard: "[root]/home-nightstand",
    navbar_position: "left",
    navbar_auto_hide: true,
    navbar_size: 56,
    navbar_float: false,
    fullscreen_default: true,
  },
  "tablet-landscape": {
    home_dashboard: "[root]/home-wallpanel-h",
    navbar_position: "bottom",
    navbar_auto_hide: false,
    navbar_size: 52,
    navbar_float: false,
    fullscreen_default: false,
  },
  "tablet-portrait": {
    home_dashboard: "[root]/home-wallpanel-v",
    navbar_position: "bottom",
    navbar_auto_hide: true,
    navbar_size: 52,
    navbar_float: false,
    fullscreen_default: false,
  },
  handheld: {
    home_dashboard: "[root]/home-handheld",
    navbar_position: "bottom",
    navbar_auto_hide: true,
    navbar_size: 56,
    navbar_float: true,
    fullscreen_default: true,
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
 * is discarded). Passing `null`/"" clears the `device_type` marker WITHOUT
 * touching the individual settings (they keep whatever the last type seeded).
 */
export function applyDeviceType(
  store: typeof settingsStore,
  type: DeviceType | null,
): void {
  if (!type) {
    store.clearValue("device", "device_type");
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
