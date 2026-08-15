/**
 * Local (TDS-served) resolution for the Room Card's bundled header photos.
 *
 * Primed once per page load with a single WS call; `roomPhotoUrl()` is then a
 * synchronous lookup so it can be used directly inside render(). Falls back to
 * the CDN only when TDS isn't installed.
 */

const DOMAIN = "teds_dashboard_system";

interface HassLike {
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
}

let _photos: Record<string, string> = {};
let _primed: Promise<void> | undefined;
let _primeResolved = false;
let _backendOk = false;
const _subs = new Set<() => void>();

/** Subscribe to prime/refresh completion (for re-render). Returns unsubscribe. */
export function onRoomPhotosChanged(cb: () => void): () => void {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

function _notify(): void {
  for (const cb of _subs) {
    try {
      cb();
    } catch {
      /* a bad subscriber must not break the others */
    }
  }
}

/** True once a list call has succeeded — i.e. the TDS backend is present. */
export function roomPhotosBackendAvailable(): boolean {
  return _backendOk;
}

/** True once the initial prime has resolved (success or failure), so callers know
 *  whether a missing local photo means "no backend" vs "not primed yet". */
export function roomPhotosPrimed(): boolean {
  return _primeResolved;
}

/** Locally-served URL for a photo filename, or undefined if unavailable. */
export function roomPhotoUrl(file: string): string | undefined {
  return _photos[file];
}

/** Filenames from `wanted` that aren't available locally. */
export function missingRoomPhotos(wanted: string[]): string[] {
  return wanted.filter((f) => !_photos[f]);
}

async function _load(hass: HassLike): Promise<void> {
  try {
    const res = await hass.callWS?.<{ photos?: Record<string, string> }>({
      type: `${DOMAIN}/list_room_photos`,
    });
    _photos = res?.photos ?? {};
    _backendOk = true;
  } catch {
    // No TDS backend (or an older one without the command) -> CDN fallback.
    _photos = {};
    _backendOk = false;
  }
  _primeResolved = true;
  _notify();
}

/** Prime the cache once per page load. Safe to call from every card. */
export function primeRoomPhotos(hass: HassLike | undefined): Promise<void> {
  if (!hass?.callWS) return Promise.resolve();
  if (!_primed) _primed = _load(hass);
  return _primed;
}

/** Force a refresh (after a download). Re-primes and notifies subscribers. */
export function refreshRoomPhotos(hass: HassLike | undefined): Promise<void> {
  if (!hass?.callWS) return Promise.resolve();
  _primed = _load(hass);
  return _primed;
}

/** Ask the backend to fetch the given photos. Returns true if all landed. */
export async function downloadRoomPhotos(
  hass: HassLike | undefined,
  files: string[],
): Promise<{ ok: boolean; failed: string[] }> {
  if (!hass?.callWS) return { ok: false, failed: files };
  try {
    const res = await hass.callWS<{
      failed?: string[];
      photos?: Record<string, string>;
    }>({ type: `${DOMAIN}/download_room_photos`, files });
    _photos = res?.photos ?? _photos;
    _backendOk = true;
    _notify();
    const failed = res?.failed ?? [];
    return { ok: failed.length === 0, failed };
  } catch {
    return { ok: false, failed: files };
  }
}
