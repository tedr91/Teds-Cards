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

/** When several Music Assistant players share an area, prefer these tiers in order
 *  (first match wins). Each entry lists keywords looked for in the player's exact
 *  provider *and* its device manufacturer / model / name (Music Assistant sets the
 *  device manufacturer to the real manufacturer, or the provider name when unknown).
 *
 *  `homepod` is a **name-derived** tier, not a provider: Music Assistant has no
 *  `homepod` provider — it reports HomePods as `airplay` (a single speaker) or
 *  `sync_group` (a stereo pair). "HomePod" only ever appears in the player's name,
 *  which is why {@link providerRank} must keep consulting the name text even once
 *  the exact provider is known. */
const PROVIDER_ORDER: string[][] = [
  ["homepod"],
  ["sonos"],
  ["chromecast", "google cast", "google", "cast", "nest"],
  ["airplay", "apple"],
  ["dlna", "upnp"],
];

/** A trailing, bracketed channel marker — "Kitchen HomePod (L)", "Desk Speaker [Right]".
 *  Deliberately anchored and bracket-bound so legitimately-named players such as
 *  "Left Porch Speaker" or "Right Bedroom" are never mistaken for one half of a pair. */
const CHANNEL_SUFFIX = /[([]\s*(?:l|r|left|right)\s*[)\]]\s*$/i;

/** Cache of each Music Assistant player's true provider (from `mass_queue/get_info`),
 *  used for exact provider-priority ranking. Combined with — not a replacement for —
 *  the player's device metadata; see {@link providerRank}. */
const providerCache = new Map<string, string>();
const providerInflight = new Set<string>();
let massQueueUnavailable = false;

interface RegistryEntity {
  platform?: string;
  device_id?: string | null;
  area_id?: string | null;
}
interface RegistryDevice {
  manufacturer?: string | null;
  model?: string | null;
  name?: string | null;
  area_id?: string | null;
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

const entityArea = (hass: HomeAssistant | undefined, id: string): string | null => {
  const reg = registry(hass);
  const entity = reg[id];
  if (entity?.area_id) return entity.area_id;
  const deviceId = entity?.device_id ?? undefined;
  return (deviceId ? devices(hass)[deviceId]?.area_id : null) ?? null;
};

export function isMassPlayer(hass: HomeAssistant | undefined, id: string): boolean {
  return registry(hass)[id]?.platform === MASS_PLAYER_PLATFORM;
}

/** True when the Home Assistant `music_assistant` **integration** is loaded. The MA
 *  *app/server* alone never exposes players as HA `media_player` entities — only the
 *  integration does — so without it the resolver can never match a player. Used to give
 *  a targeted "add the integration" hint instead of a bare "no player found". */
export function isMassIntegrationLoaded(hass: HomeAssistant | undefined): boolean {
  const comps = (hass as unknown as { config?: { components?: string[] } } | undefined)?.config
    ?.components;
  return Array.isArray(comps) && comps.includes("music_assistant");
}

/** All Music Assistant media_player entity ids. */
function massPlayers(hass: HomeAssistant | undefined): string[] {
  const reg = registry(hass);
  return Object.keys(reg).filter(
    (id) => id.startsWith("media_player.") && reg[id]?.platform === MASS_PLAYER_PLATFORM,
  );
}

/** Lower-cased device manufacturer / model / name plus the entity's friendly name and
 *  id — the cache-independent half of a player's ranking text. */
function metadataText(hass: HomeAssistant | undefined, id: string): string {
  const deviceId = registry(hass)[id]?.device_id ?? undefined;
  const dev = deviceId ? devices(hass)[deviceId] : undefined;
  return [dev?.manufacturer, dev?.model, dev?.name, entityName(hass, id), id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Priority rank of a Music Assistant player by its provider (lower = preferred);
 *  unknown providers rank last.
 *
 *  The exact provider (from `mass_queue/get_info`, once {@link warmMassProviders} has
 *  run) is **concatenated with** — never substituted for — the device metadata text.
 *  That is load-bearing: HomePods report provider `airplay` or `sync_group`, so the
 *  `homepod` tier lives purely in the player's *name*. Replacing the text with the
 *  exact provider would make that tier match while the cache is cold and silently
 *  stop matching once it warms — an intermittent, near-undebuggable race.
 *
 *  Concatenating instead keeps the rank deterministic: tiers are scanned in order and
 *  the first keyword hit wins, so the metadata half alone already yields the cold
 *  rank, and warming can only *append* text — never remove a keyword, never demote a
 *  player. Exact-provider matching stays authoritative for the genuine provider tiers,
 *  ranking players whose metadata gives nothing away. */
function providerRank(hass: HomeAssistant | undefined, id: string): number {
  const exact = providerCache.get(id);
  const meta = metadataText(hass, id);
  const text = exact ? `${exact} ${meta}` : meta;
  const idx = PROVIDER_ORDER.findIndex((keys) => keys.some((k) => text.includes(k)));
  return idx === -1 ? PROVIDER_ORDER.length : idx;
}

/** Tie-break weight within one provider tier (lower = preferred): a combined player
 *  beats a single channel of a stereo pair.
 *
 *  A HomePod pair exposes all three of "Kitchen HomePod (L)", "Kitchen HomePod (R)" and
 *  the "Kitchen HomePods" sync group, and all three land in the `homepod` tier — without
 *  this the sort is arbitrary and the card can auto-select one half and play **mono**.
 *  Cache-independent by construction: the group scores 0 cold and -1 warm while the
 *  channels always score +1, so the group wins either way. */
function channelRank(hass: HomeAssistant | undefined, id: string): number {
  if (providerCache.get(id)?.includes("group")) return -1;
  return CHANNEL_SUFFIX.test(entityName(hass, id)) ? 1 : 0;
}

/** Preference order between two Music Assistant players: provider tier, then combined
 *  players over single channels, then entity id so the sort is never arbitrary. */
function compareMassPlayers(hass: HomeAssistant | undefined, a: string, b: string): number {
  return (
    providerRank(hass, a) - providerRank(hass, b) ||
    channelRank(hass, a) - channelRank(hass, b) ||
    a.localeCompare(b)
  );
}

/** Best-effort: find the Music Assistant player matching a physical speaker.
 *  Explicit speaker choices prioritize identity/name matching. The device's own
 *  fallback prioritizes the room's preferred provider before matching its name. */
function matchMassPlayer(
  hass: HomeAssistant | undefined,
  base: string,
  preferAreaProvider: boolean,
): string | undefined {
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
  const baseArea = entityArea(hass, base);

  const bestInArea = (): string | undefined => {
    if (!baseArea) return undefined;
    const inArea = candidates.filter((id) => entityArea(hass, id) === baseArea);
    if (inArea.length === 0) return undefined;
    inArea.sort((a, b) => compareMassPlayers(hass, a, b));
    return inArea[0];
  };

  if (preferAreaProvider) {
    const preferred = bestInArea();
    if (preferred) return preferred;
  }

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
      if (baseArea && entityArea(hass, id) === baseArea) score += 15;
      if (!best || score > best.score) best = { id, score };
    }
    if (best && best.score >= 25) return best.id;
  }

  // 4) No name match — a Music Assistant player in the same area, preferring
  //    providers in order (HomePod → Sonos → Chromecast → AirPlay → DLNA) and a
  //    stereo pair's combined player over one of its channels.
  return bestInArea();
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
  const hasConfiguredBase =
    !!opts.entity ||
    (opts.useSettings !== false &&
      [settingsStore.get("music_player"), settingsStore.get("system_sound_player")].some(
        (value) => typeof value === "string" && value.length > 0,
      ));
  const matched = matchMassPlayer(hass, base, !hasConfiguredBase);
  return matched
    ? { state: "ok", entity: matched, base, matched: true }
    : { state: "unmatched", base };
}

interface WsConnHass {
  connection?: { sendMessagePromise<T = unknown>(msg: Record<string, unknown>): Promise<T> };
}

/**
 * Warm the exact-provider cache (via the `mass_queue/get_info` WebSocket command) for
 * the Music Assistant players in this device's area — the only place provider priority
 * is used. Resolves `true` when the cache changed, so the caller can re-render. No-op
 * without `mass_queue`, without a resolvable area, or with fewer than two area players.
 */
export async function warmMassProviders(hass: HomeAssistant | undefined): Promise<boolean> {
  if (massQueueUnavailable) return false;
  const conn = (hass as WsConnHass | undefined)?.connection;
  if (!conn?.sendMessagePromise) return false;
  const base = baseEntity(hass, {});
  const baseArea = base ? entityArea(hass, base) : null;
  if (!baseArea) return false;
  const sameArea = massPlayers(hass).filter((id) => entityArea(hass, id) === baseArea);
  if (sameArea.length < 2) return false;
  const ids = sameArea.filter((id) => !providerCache.has(id) && !providerInflight.has(id));
  if (ids.length === 0) return false;
  let changed = false;
  await Promise.all(
    ids.map(async (id) => {
      providerInflight.add(id);
      try {
        const info = await conn.sendMessagePromise<{ provider?: string }>({
          type: "mass_queue/get_info",
          entity_id: id,
        });
        providerCache.set(id, typeof info?.provider === "string" ? info.provider.toLowerCase() : "");
        changed = true;
      } catch (err) {
        // Stop trying if the command isn't registered (mass_queue not installed).
        if ((err as { code?: string })?.code === "unknown_command") massQueueUnavailable = true;
      } finally {
        providerInflight.delete(id);
      }
    }),
  );
  return changed;
}
