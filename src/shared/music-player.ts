/**
 * Resolve the Music Assistant player for the current device — shared by the Music
 * card, the Settings card (fallback hint) and the Status card so they all agree on
 * which player is used and whether it was auto-matched.
 *
 * The starting ("base") player is: an explicit entity → this device's `music_player`
 * setting → its `system_sound_player` setting → its own registered player. If that
 * base isn't already a Music Assistant player, it's best-effort matched to one.
 */
import type { HomeAssistant } from "custom-card-helpers";

import { resolveDeviceMediaPlayer } from "./device-id";
import { settingsStore } from "./settings";

/** Entity-registry platform of Music Assistant media_player entities. */
export const MASS_PLAYER_PLATFORM = "music_assistant";

/** When several Music Assistant players share an area, prefer these providers in
 *  order. Each entry lists keywords looked for in the player's device
 *  manufacturer / model / name (Music Assistant sets the device manufacturer to the
 *  real manufacturer, or the provider name when unknown). */
const PROVIDER_ORDER: string[][] = [
  ["sonos"],
  ["chromecast", "google cast", "google", "cast", "nest"],
  ["airplay", "apple"],
  ["dlna", "upnp"],
];

interface RegistryEntity {
  platform?: string;
  device_id?: string | null;
  area_id?: string | null;
}
interface RegistryDevice {
  manufacturer?: string | null;
  model?: string | null;
  name?: string | null;
}
type RegistryHass = HomeAssistant & {
  entities?: Record<string, RegistryEntity | undefined>;
  devices?: Record<string, RegistryDevice | undefined>;
};

/** Outcome of resolving the music player for a device. */
export type MusicPlayerResolution =
  | { state: "empty" }
  | { state: "unmatched"; base: string }
  | { state: "ok"; entity: string; base: string; matched: boolean };

export interface ResolveMusicPlayerOptions {
  /** Explicit entity override (wins over settings). */
  entity?: string;
  /** Read the per-device settings for the base player. Default true. */
  useSettings?: boolean;
  /** Auto-match a non-Music-Assistant base to a Music Assistant player. Default true. */
  autoResolve?: boolean;
}

const registry = (hass?: HomeAssistant): Record<string, RegistryEntity | undefined> =>
  (hass as RegistryHass | undefined)?.entities ?? {};

const devices = (hass?: HomeAssistant): Record<string, RegistryDevice | undefined> =>
  (hass as RegistryHass | undefined)?.devices ?? {};

const entityName = (hass: HomeAssistant | undefined, id: string): string => {
  const fn = hass?.states[id]?.attributes?.friendly_name;
  return typeof fn === "string" ? fn : id;
};

export function isMassPlayer(hass: HomeAssistant | undefined, id: string): boolean {
  return registry(hass)[id]?.platform === MASS_PLAYER_PLATFORM;
}

/** All Music Assistant media_player entity ids. */
function massPlayers(hass: HomeAssistant | undefined): string[] {
  const reg = registry(hass);
  return Object.keys(reg).filter(
    (id) => id.startsWith("media_player.") && reg[id]?.platform === MASS_PLAYER_PLATFORM,
  );
}

/** Priority rank of a Music Assistant player by its provider (lower = preferred);
 *  unknown providers rank last. Uses the player's device manufacturer/model/name. */
function providerRank(hass: HomeAssistant | undefined, id: string): number {
  const deviceId = registry(hass)[id]?.device_id ?? undefined;
  const dev = deviceId ? devices(hass)[deviceId] : undefined;
  const text = [dev?.manufacturer, dev?.model, dev?.name, entityName(hass, id), id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const idx = PROVIDER_ORDER.findIndex((keys) => keys.some((k) => text.includes(k)));
  return idx === -1 ? PROVIDER_ORDER.length : idx;
}

/** Best-effort: find the Music Assistant player matching a physical speaker.
 *  Tiers: same HA device → exact name → best name-token overlap → same area (by provider). */
function matchMassPlayer(hass: HomeAssistant | undefined, base: string): string | undefined {
  const reg = registry(hass);
  const candidates = massPlayers(hass);
  if (candidates.length === 0) return undefined;

  // 1) Same underlying HA device — the strongest signal.
  const baseDevice = reg[base]?.device_id ?? null;
  if (baseDevice) {
    const byDevice = candidates.find((id) => reg[id]?.device_id === baseDevice);
    if (byDevice) return byDevice;
  }

  const tokenize = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const baseTokens = tokenize(entityName(hass, base));
  const baseJoined = baseTokens.join("");
  const baseArea = reg[base]?.area_id ?? null;

  // 2) Exact normalized name.
  if (baseJoined) {
    const exact = candidates.find((id) => tokenize(entityName(hass, id)).join("") === baseJoined);
    if (exact) return exact;
  }

  // 3) Rank the rest by name-token overlap; a shared area breaks ties.
  if (baseTokens.length > 0) {
    let best: { id: string; score: number } | undefined;
    for (const id of candidates) {
      const cTokens = tokenize(entityName(hass, id));
      if (cTokens.length === 0) continue;
      const lenGap = Math.abs(cTokens.length - baseTokens.length);
      let score: number;
      if (
        baseTokens.every((t) => cTokens.includes(t)) ||
        cTokens.every((t) => baseTokens.includes(t))
      ) {
        // One name's tokens fully contain the other (e.g. "Office" ↔ "Office Speaker").
        score = 60 - lenGap * 5;
      } else {
        const shared = baseTokens.filter((t) => cTokens.includes(t)).length;
        if (shared === 0) continue;
        score = 20 + shared * 5 - lenGap * 3;
      }
      if (baseArea && reg[id]?.area_id === baseArea) score += 15;
      if (!best || score > best.score) best = { id, score };
    }
    if (best && best.score >= 25) return best.id;
  }

  // 4) No name match — a Music Assistant player in the same area, preferring
  //    providers in order (Sonos → Chromecast → AirPlay → DLNA).
  if (baseArea) {
    const inArea = candidates.filter((id) => reg[id]?.area_id === baseArea);
    if (inArea.length) {
      inArea.sort((a, b) => providerRank(hass, a) - providerRank(hass, b));
      return inArea[0];
    }
  }
  return undefined;
}

/** The starting player before Music Assistant matching. */
function baseEntity(
  hass: HomeAssistant | undefined,
  opts: ResolveMusicPlayerOptions,
): string | undefined {
  if (opts.entity) return opts.entity;
  if (opts.useSettings === false) return undefined;
  const music = settingsStore.get("music_player");
  if (typeof music === "string" && music) return music;
  const system = settingsStore.get("system_sound_player");
  if (typeof system === "string" && system) return system;
  return resolveDeviceMediaPlayer(hass);
}

/** Resolve the effective Music Assistant player (and whether it was auto-matched). */
export function resolveMusicPlayer(
  hass: HomeAssistant | undefined,
  opts: ResolveMusicPlayerOptions = {},
): MusicPlayerResolution {
  const base = baseEntity(hass, opts);
  if (!base) return { state: "empty" };
  if (isMassPlayer(hass, base)) return { state: "ok", entity: base, base, matched: false };
  // Trust an explicit entity / disabled auto-resolve as-is.
  if (opts.autoResolve === false) return { state: "ok", entity: base, base, matched: false };
  const matched = matchMassPlayer(hass, base);
  return matched
    ? { state: "ok", entity: matched, base, matched: true }
    : { state: "unmatched", base };
}
