/**
 * Shared helpers for the Automatic Night Mode feature.
 *
 * Night mode is a composite setting (kind "nightmode") stored as the `night_*` keys below,
 * mirroring the `background_*` composite. The night-mode engine reads these to run a nightly
 * schedule that dims the background, lowers screen brightness, and switches the font color to
 * a night value, restoring the stored "day" values in the morning.
 */
import { browserModId } from "./device-id";

/** The sub-keys backing the "nightmode" composite setting (mirror `SETTINGS_DEFAULTS`). */
export const NIGHTMODE_KEYS = [
  "night_enabled",
  "night_start",
  "night_end",
  "night_dim_brightness",
  "night_dim_background",
  "night_font_color",
  "night_transition_minutes",
  "night_dark_mode",
  "night_brightness_entity",
] as const;

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
