/**
 * Shared helpers for the Automatic Night Mode feature.
 *
 * Night mode is a composite setting (kind "nightmode") stored as the `night_*` keys below,
 * mirroring the `background_*` composite. The night-mode engine reads these to run a nightly
 * schedule that dims the background, lowers screen brightness, and switches the font color to
 * a night value, restoring the stored "day" values in the morning.
 */
import { browserModId } from "./device-id";

/** Top-level (“General”) night settings — one per-device override unit. */
export const NIGHT_GENERAL_KEYS = [
  "night_schedule_source",
  "night_start",
  "night_end",
  "night_transition_seconds",
  "night_dark_mode",
] as const;

/** Screen-brightness sub-section keys (one override unit). */
export const NIGHT_SCREEN_KEYS = [
  "night_screen_auto",
  "night_screen_day",
  "night_dim_brightness",
  "night_brightness_entity",
] as const;

/** Background sub-section keys (one override unit). */
export const NIGHT_BACKGROUND_KEYS = [
  "night_background_auto",
  "night_background_hide",
  "night_background_day",
  "night_dim_background",
] as const;

/** Font sub-section keys (one override unit). */
export const NIGHT_FONT_KEYS = ["night_font_shift", "night_font_color"] as const;

/** All sub-keys backing the "nightmode" composite setting (mirror `SETTINGS_DEFAULTS`). */
export const NIGHTMODE_KEYS = [
  ...NIGHT_GENERAL_KEYS,
  ...NIGHT_SCREEN_KEYS,
  ...NIGHT_BACKGROUND_KEYS,
  ...NIGHT_FONT_KEYS,
] as const;

/** How the night window is determined: fixed manual times, or the Sun integration
 *  (actual sunset/sunrise, or civil dusk/dawn). */
export type NightScheduleSource = "manual" | "sun_setting_rising" | "sun_dusk_dawn";

/** Default background brightness at night (percent) → used if `night_dim_background` is unset. */
export const NIGHT_BACKGROUND_DIM = 0.5;

/** Convert a brightness percent (0..100) to a black-overlay dim fraction (0..1). */
export function brightnessToDim(pct: number): number {
  const p = Number.isNaN(pct) ? 100 : Math.max(0, Math.min(100, pct));
  return 1 - p / 100;
}

/** Parse an "HH:MM" / "HH:MM:SS" time string to minutes-since-midnight. `null` if invalid. */
export function parseTimeToMinutes(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Current local time as minutes-since-midnight. */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * True when `now` (minutes) falls inside the night window [start, end). Handles the common
 * overnight wrap where the window spans midnight (start > end, e.g. 21:00 → 07:00). When start
 * equals end the window is empty (never night).
 */
export function isNight(now: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  // Overnight wrap: night is now >= start (evening) OR now < end (early morning).
  return now >= start || now < end;
}

/**
 * True when it's currently night per the Sun integration (`sun.sun`), using the chosen
 * event pair: actual sunset/sunrise (`sun_setting_rising`) or civil dusk/dawn
 * (`sun_dusk_dawn`). Returns `null` when `sun.sun` (or the needed attributes) aren't
 * available, so callers can fall back to the manual window.
 *
 * `sun.sun` exposes the NEXT occurrence of each event as an ISO datetime. When the next
 * up-event (rising/dawn) comes BEFORE the next down-event (setting/dusk), the sun is
 * currently below the horizon → it's night.
 */
export function isNightBySun(hass: unknown, source: NightScheduleSource): boolean | null {
  const states = (hass as { states?: Record<string, { attributes?: Record<string, unknown> }> } | undefined)?.states;
  const attrs = states?.["sun.sun"]?.attributes;
  if (!attrs) return null;
  const [up, down] =
    source === "sun_dusk_dawn" ? ["next_dawn", "next_dusk"] : ["next_rising", "next_setting"];
  const upT = Date.parse(String(attrs[up] ?? ""));
  const downT = Date.parse(String(attrs[down] ?? ""));
  if (!Number.isFinite(upT) || !Number.isFinite(downT)) return null;
  return upT < downT;
}

/** Minimal registry shapes present on `hass` at runtime (not on the typed HA). */
interface RegistryHass {
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
}

/**
 * Resolve the screen-brightness entity for *this* client when the user hasn't picked one.
 * browser_mod registers a `light.*` "Screen" entity per browser that simulates a dimmed screen
 * via a dark overlay — the natural target for night dimming. Returns the first `light.` entity
 * on this browser_mod device, or undefined when none is found.
 */
export function resolveBrightnessEntity(hass: unknown): string | undefined {
  const h = hass as RegistryHass | undefined;
  const bid = browserModId();
  if (!bid || !h?.devices || !h.entities) return undefined;

  let deviceId: string | undefined;
  for (const [id, dev] of Object.entries(h.devices)) {
    if (dev?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === bid)) {
      deviceId = id;
      break;
    }
  }
  if (!deviceId) return undefined;

  for (const [entityId, ent] of Object.entries(h.entities)) {
    if (ent?.device_id === deviceId && entityId.startsWith("light.")) return entityId;
  }
  return undefined;
}
