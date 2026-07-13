/**
 * Module-level singleton that owns the wallpaper state so it stays CONSISTENT as
 * you navigate between dashboard views. Each view mounts its own invisible
 * ted-background-card, but they all drive this one engine:
 *
 *   - The injected view style is never torn down on view change (no flash).
 *   - The slideshow list + current index + cycle timer live here (not per-card),
 *     so navigating between views never reshuffles or jumps to a new image — the
 *     same wallpaper persists and only advances on its own timer.
 *
 * A card `attach()`es on connect and `detach()`es on disconnect (ref-counted).
 * When the last card detaches we keep the wallpaper painted and just pause the
 * ticking, so the brief gap during navigation shows no change.
 */

import { settingsStore } from "../../shared/settings";
import {
  BACKGROUND_KEYS,
  type BackgroundScrim,
  backgroundLayerCss,
  type BackgroundMode,
  type BackgroundTypePref,
  DARK_LUMINANCE_THRESHOLD,
  imageLuminance,
  listBuiltinBackgroundsCdn,
} from "../../shared/background";
import { SETTINGS_DEFAULTS, type SettingsMap } from "../../shared/settings-schema";
import {
  getMediaFolder,
  isMediaSourceUri,
  listBuiltinBackgrounds,
  listFolderImages,
  resolveMediaSource,
} from "../../shared/media";
import { applyBackground } from "./background-dom";

interface HassLike {
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  fetchWithAuth?(path: string, init?: RequestInit): Promise<Response>;
}

class BackgroundEngine {
  private refCount = 0;
  private hass?: HassLike;
  private unsub?: () => void;
  /** Bumped on every (re)apply so stale async resolutions never win a race. */
  private gen = 0;

  /** The active card's per-card background_* overrides (undefined = none). */
  private cardConfig?: SettingsMap;
  /** Whether the active card opts into the backend settings store. */
  private backendInt = false;

  private slideUrls: string[] = [];
  private slideIdx = 0;
  private slideSig?: string;
  private cycleMin?: number;
  private timer?: number;
  private lastDark?: boolean;

  /** A card connected: keep the engine live and paint the current wallpaper. */
  attach(hass: HassLike | undefined, config?: SettingsMap, backendInt = false): void {
    this.refCount++;
    this.hass = hass;
    this.cardConfig = config;
    this.backendInt = backendInt;
    this.lastDark = this._isDark();
    // Only subscribe to the backend settings store when a card opts in.
    if (backendInt && !this.unsub) this.unsub = settingsStore.subscribe(() => this.apply());
    this.apply();
  }

  /** Update the active card's config (e.g. edited in the card editor) + re-apply. */
  setConfig(config: SettingsMap | undefined, backendInt: boolean): void {
    this.cardConfig = config;
    if (backendInt !== this.backendInt) {
      this.backendInt = backendInt;
      if (backendInt && !this.unsub) this.unsub = settingsStore.subscribe(() => this.apply());
      if (!backendInt && this.unsub) {
        this.unsub();
        this.unsub = undefined;
      }
    }
    this.apply();
  }

  /** Effective settings: card config overrides win per-field over either the
   *  backend store (when integrated) or the plain defaults (card-only). */
  private _effective(): SettingsMap {
    const base: SettingsMap = this.backendInt ? settingsStore.effective() : { ...SETTINGS_DEFAULTS };
    if (!this.cardConfig) return base;
    const merged: SettingsMap = { ...base };
    for (const k of BACKGROUND_KEYS) {
      const v = this.cardConfig[k];
      if (v !== undefined) merged[k] = v;
    }
    return merged;
  }

  /** A card disconnected. Keep the wallpaper + slideshow position; only pause
   *  reacting/ticking once no card is mounted, so navigation never flashes. */
  detach(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.unsub?.();
      this.unsub = undefined;
      this._stopTimer();
    }
  }

  /** Latest hass from the currently-mounted card. Re-applies when hass first
   *  arrives or the theme's light/dark state flips (affects "match theme"). */
  setHass(hass: HassLike | undefined): void {
    const hadHass = !!this.hass;
    this.hass = hass;
    const dark = this._isDark();
    if ((!hadHass && hass) || dark !== this.lastDark) {
      this.lastDark = dark;
      this.apply();
    }
  }

  private _isDark(): boolean {
    return !!(this.hass as unknown as { themes?: { darkMode?: boolean } })?.themes?.darkMode;
  }

  private async _resolveRef(ref: string | null): Promise<string | null> {
    if (!ref) return null;
    if (isMediaSourceUri(ref) && this.hass) return resolveMediaSource(this.hass, ref);
    return ref;
  }

  apply(): void {
    const gen = ++this.gen;
    const s = this._effective();
    const mode = (s.background_mode as BackgroundMode) ?? "solid";

    if (mode !== "slideshow") {
      this._stopTimer();
      this.slideSig = undefined;
      this.slideUrls = [];
    }

    if (mode === "theme") {
      applyBackground(null);
      return;
    }
    if (mode === "solid") {
      applyBackground(backgroundLayerCss(s, null));
      return;
    }
    if (mode === "image") {
      const ref = typeof s.background_image === "string" ? s.background_image : null;
      void this._resolveRef(ref).then((url) => {
        if (gen === this.gen) void this._paint(s, url, gen);
      });
      return;
    }
    void this._applySlideshow(s, gen);
  }

  /** Paint a wallpaper image, compositing the readability scrim when enabled. */
  private async _paint(s: SettingsMap, url: string | null, gen: number): Promise<void> {
    const scrim = await this._scrimFor(s, url);
    if (gen !== this.gen) return;
    applyBackground(backgroundLayerCss(s, url, scrim));
  }

  /** A luminance-derived scrim that tones a clashing image toward the theme's
   *  contrast (bright image on a dark theme → darken; dark image on a light theme
   *  → lighten). Opacity is capped by `background_readability_strength` (0–100). */
  private async _scrimFor(s: SettingsMap, url: string | null): Promise<BackgroundScrim | undefined> {
    if (!url || s.background_enhance_readability === false) return undefined;
    const strength = Math.max(0, Math.min(100, Number(s.background_readability_strength ?? 45))) / 100;
    if (strength <= 0) return undefined;
    const l = await imageLuminance(url);
    if (l === null) return undefined;
    if (this._isDark() && l > 0.55) {
      return { color: "0,0,0", opacity: Math.min(1, (l - 0.55) / 0.45) * strength };
    }
    if (!this._isDark() && l < 0.45) {
      return { color: "255,255,255", opacity: Math.min(1, (0.45 - l) / 0.45) * strength };
    }
    return undefined;
  }

  private async _applySlideshow(s: SettingsMap, gen: number): Promise<void> {
    // Signature of everything that determines WHICH images play (not the cycle
    // time). We only rebuild + reshuffle when this changes — so navigating
    // between views keeps the same shuffled list and current image.
    const sig = JSON.stringify({
      album: s.background_album ?? "builtin",
      folder: s.background_folder ?? "",
      pref: s.background_type_pref ?? "match",
      shuffle: s.background_shuffle !== false,
      dark: this._isDark(),
    });
    const rebuilt = sig !== this.slideSig || this.slideUrls.length === 0;
    if (rebuilt) {
      const urls = await this._slideshowUrls(s);
      if (gen !== this.gen) return;
      if (s.background_shuffle !== false) shuffle(urls);
      this.slideUrls = urls;
      this.slideIdx = 0;
      this.slideSig = sig;
    }
    if (gen !== this.gen) return;
    if (!this.slideUrls.length) {
      applyBackground(backgroundLayerCss(s, null));
      return;
    }
    if (this.slideIdx >= this.slideUrls.length) this.slideIdx = 0;
    await this._paint(s, this.slideUrls[this.slideIdx], gen);

    // Start/keep the cycle timer. Don't restart it on a plain navigation or an
    // unrelated settings change (that would keep resetting the countdown) — only
    // when the list was rebuilt, the cycle changed, or no timer is running yet.
    const cycle = Math.max(1, Number(s.background_cycle_minutes ?? 30));
    if (rebuilt || this.timer === undefined || cycle !== this.cycleMin) {
      this.cycleMin = cycle;
      this._startTimer(cycle);
    }
  }

  private _startTimer(cycleMinutes: number): void {
    this._stopTimer();
    if (this.slideUrls.length < 2) return;
    this.timer = window.setInterval(() => {
      this.slideIdx = (this.slideIdx + 1) % this.slideUrls.length;
      void this._paint(this._effective(), this.slideUrls[this.slideIdx], this.gen);
    }, cycleMinutes * 60_000);
  }

  private _stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async _slideshowUrls(s: SettingsMap): Promise<string[]> {
    let candidates: string[];
    if (s.background_album === "folder") {
      if (!this.hass) return [];
      let folder = typeof s.background_folder === "string" ? s.background_folder : "";
      // Default to the backend's "Ted Dash System" media folder when none is set.
      if (!folder) folder = (await getMediaFolder(this.hass)) ?? "";
      if (!folder) return [];
      const uris = await listFolderImages(this.hass, folder);
      const resolved = await Promise.all(uris.map((u) => this._resolveRef(u)));
      candidates = resolved.filter((u): u is string => !!u);
    } else {
      // Built-ins: served locally by the backend when integrated, else from the CDN
      // (so card-only users without the integration still get the bundled wallpapers).
      const cat =
        this.backendInt && this.hass
          ? await listBuiltinBackgrounds(this.hass)
          : await listBuiltinBackgroundsCdn();
      candidates = [...cat.general, ...cat.light, ...cat.dark];
    }
    return this._filterByMood(candidates, s);
  }

  /** Mood matching: keep images whose luminance matches the target (theme for
   *  "match", or forced light/dark). "all" disables filtering. Falls back to the
   *  full list when nothing matches (or luminance couldn't be analyzed). */
  private async _filterByMood(urls: string[], s: SettingsMap): Promise<string[]> {
    const pref = (s.background_type_pref as BackgroundTypePref) ?? "match";
    if (pref === "all" || urls.length === 0) return urls;
    const wantDark = pref === "match" ? this._isDark() : pref === "dark";
    const tagged = await Promise.all(urls.map(async (u) => ({ u, l: await imageLuminance(u) })));
    const matched = tagged
      .filter(({ l }) => l !== null && l < DARK_LUMINANCE_THRESHOLD === wantDark)
      .map((t) => t.u);
    return matched.length ? matched : urls;
  }
}

/** The single shared engine (one wallpaper across all views). */
export const backgroundEngine = new BackgroundEngine();

/** In-place Fisher–Yates shuffle. */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
