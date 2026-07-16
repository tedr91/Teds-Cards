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
import { applyAttribution, applyBackground } from "./background-dom";

interface HassLike {
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
  fetchWithAuth?(path: string, init?: RequestInit): Promise<Response>;
}

/** One entry returned by the backend `list_bing_photos` WebSocket command. */
interface BingPhoto {
  url: string;
  title?: string;
  copyright?: string;
  startdate?: string;
}

/** How often to re-poll the Bing feed for a fresh daily image (long-running
 *  kiosks never navigate, so the slideshow list is refreshed on this cadence). */
const BING_REFRESH_MS = 6 * 60 * 60 * 1000;

/** A snapshot of the last readability-scrim decision, for the Settings debug panel. */
export interface BackgroundDiagnostic {
  mode: string;
  url: string | null;
  /** Mean image luminance 0..1, or null when it couldn't be analyzed. */
  luminance: number | null;
  dark: boolean;
  enhance: boolean;
  strength: number; // 0..100
  scrimColor: string | null;
  scrimOpacity: number; // 0..1
  reason: string;
}

class BackgroundEngine {
  private refCount = 0;
  private hass?: HassLike;
  private unsub?: () => void;
  /** Bumped on every (re)apply so stale async resolutions never win a race. */
  private gen = 0;

  /** Last readability-scrim decision (for the Settings debug panel). */
  private _diag: BackgroundDiagnostic = {
    mode: "solid",
    url: null,
    luminance: null,
    dark: false,
    enhance: true,
    strength: 45,
    scrimColor: null,
    scrimOpacity: 0,
    reason: "Not computed yet",
  };
  private _diagListeners = new Set<() => void>();

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
  /** Automatic Night Mode: extra black-overlay fraction (0..1) darkening the wallpaper. */
  private _nightDim = 0;
  /** Last painted state, so `setNightDim` can repaint without re-resolving the image. */
  private _lastS?: SettingsMap;
  private _lastUrl: string | null = null;
  private _lastScrim?: BackgroundScrim;
  /** url -> attribution for the current Bing "Photo of the Day" candidates. */
  private bingMeta = new Map<string, { title: string; copyright: string }>();
  /** Periodic re-poll of the Bing feed while the Bing album is active. */
  private bingRefreshTimer?: number;

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
      this._stopBingRefresh();
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

  /** Automatic Night Mode: darken the current wallpaper by `frac` (0..1). Repaints
   *  from the last-painted state (no image re-resolve), so the night-mode engine can
   *  smoothly animate the dim over the transition duration. No-op in HA Theme mode. */
  setNightDim(frac: number): void {
    const f = Math.max(0, Math.min(1, frac));
    if (f === this._nightDim) return;
    this._nightDim = f;
    if (this._lastS)
      applyBackground(backgroundLayerCss(this._lastS, this._lastUrl, this._lastScrim, this._dimFor(this._lastS)));
  }

  /** The effective background-dim fraction: the base dim from `background_brightness`
   *  (100% = none) combined with (max of) the Night Mode override. */
  private _dimFor(s: SettingsMap): number {
    const pct = Math.max(0, Math.min(100, Number(s.background_brightness ?? 100)));
    const base = 1 - pct / 100;
    return Math.max(base, this._nightDim);
  }

  /** The last readability-scrim decision. */
  getDiagnostic(): BackgroundDiagnostic {
    return this._diag;
  }

  /** Subscribe to readability-diagnostic changes (fires on each (re)paint). */
  subscribeDiagnostic(cb: () => void): () => void {
    this._diagListeners.add(cb);
    return () => this._diagListeners.delete(cb);
  }

  private _setDiag(d: BackgroundDiagnostic): void {
    this._diag = d;
    for (const cb of this._diagListeners) cb();
  }

  /** Record a diagnostic for a non-image mode (no scrim ever applies). */
  private _setModeDiag(s: SettingsMap, reason: string): void {
    this._setDiag({
      mode: String(s.background_mode ?? "solid"),
      url: null,
      luminance: null,
      dark: this._isDark(),
      enhance: s.background_enhance_readability !== false,
      strength: Math.max(0, Math.min(100, Number(s.background_readability_strength ?? 45))),
      scrimColor: null,
      scrimOpacity: 0,
      reason,
    });
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
      this._stopBingRefresh();
      this.slideSig = undefined;
      this.slideUrls = [];
      if (mode !== "image") applyAttribution(null);
    }

    if (mode === "theme") {
      this._setModeDiag(s, "HA Theme mode — no wallpaper painted, so no readability scrim.");
      this._lastS = undefined;
      applyBackground(null);
      return;
    }
    if (mode === "solid") {
      this._setModeDiag(s, "Solid Color mode — the readability scrim only applies to Single Image / Slideshow.");
      this._lastS = s;
      this._lastUrl = null;
      this._lastScrim = undefined;
      applyBackground(backgroundLayerCss(s, null, undefined, this._dimFor(s)));
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
    this._lastS = s;
    this._lastUrl = url;
    this._lastScrim = scrim;
    applyBackground(backgroundLayerCss(s, url, scrim, this._dimFor(s)));
    this._updateAttribution(s, url);
  }

  /** Show the Bing attribution overlay (title/copyright) for the current image,
   *  or remove it for any non-Bing wallpaper. */
  private _updateAttribution(s: SettingsMap, url: string | null): void {
    const isBing =
      String(s.background_mode ?? "solid") === "slideshow" &&
      String(s.background_album ?? "builtin") === "bing_pod";
    const meta = url ? this.bingMeta.get(url) : undefined;
    if (!isBing || !meta || (!meta.title && !meta.copyright)) {
      applyAttribution(null);
      return;
    }
    applyAttribution({ title: meta.title, copyright: meta.copyright });
  }

  /** A luminance-derived scrim that tones a clashing image toward the theme's
   *  contrast (bright image on a dark theme → darken; dark image on a light theme
   *  → lighten). Opacity is capped by `background_readability_strength` (0–100). */
  private async _scrimFor(s: SettingsMap, url: string | null): Promise<BackgroundScrim | undefined> {
    const dark = this._isDark();
    const enhance = s.background_enhance_readability !== false;
    const strengthPct = Math.max(0, Math.min(100, Number(s.background_readability_strength ?? 45)));
    const strength = strengthPct / 100;
    const mode = String(s.background_mode ?? "solid");
    const record = (
      luminance: number | null,
      scrim: BackgroundScrim | undefined,
      reason: string,
    ): BackgroundScrim | undefined => {
      this._setDiag({
        mode,
        url,
        luminance,
        dark,
        enhance,
        strength: strengthPct,
        scrimColor: scrim?.color ?? null,
        scrimOpacity: scrim?.opacity ?? 0,
        reason,
      });
      return scrim;
    };
    if (!url) return record(null, undefined, "No image resolved yet.");
    if (!enhance) return record(null, undefined, "Enhance readability is off.");
    if (strength <= 0) return record(null, undefined, "Readability strength is 0%.");
    const l = await imageLuminance(url);
    if (l === null)
      return record(null, undefined, "Could not analyze the image — the canvas is tainted (the image server sent no CORS headers), so no scrim can be computed.");
    if (dark && l > 0.55)
      return record(l, { color: "0,0,0", opacity: Math.min(1, (l - 0.55) / 0.45) * strength }, "Bright image on a dark theme → darkened.");
    if (!dark && l < 0.45)
      return record(l, { color: "255,255,255", opacity: Math.min(1, (0.45 - l) / 0.45) * strength }, "Dark image on a light theme → lightened.");
    return record(l, undefined, "Image already matches the theme — no scrim needed.");
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
      this._lastS = s;
      this._lastUrl = null;
      this._lastScrim = undefined;
      applyBackground(backgroundLayerCss(s, null, undefined, this._dimFor(s)));
      return;
    }
    if (this.slideIdx >= this.slideUrls.length) this.slideIdx = 0;
    await this._paint(s, this.slideUrls[this.slideIdx], gen);

    // Long-running-kiosk freshness: while the Bing album is active, re-poll the
    // feed daily so a new "Photo of the Day" swaps in without navigation.
    if (s.background_album === "bing_pod") this._startBingRefresh();
    else this._stopBingRefresh();

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
    } else if (s.background_album === "bing_pod") {
      // Bing "Photo of the Day": the backend downloads + serves the images and
      // returns their attribution. Requires the integration (the feed isn't
      // CORS-accessible from the browser).
      this.bingMeta.clear();
      if (!this.backendInt || !this.hass?.callWS) return [];
      try {
        const r = await this.hass.callWS<{ photos?: BingPhoto[] }>({
          type: "teds_cards_backend/list_bing_photos",
        });
        const photos = r?.photos ?? [];
        for (const p of photos)
          this.bingMeta.set(p.url, { title: p.title ?? "", copyright: p.copyright ?? "" });
        candidates = photos.map((p) => p.url);
      } catch {
        candidates = [];
      }
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

  private _startBingRefresh(): void {
    if (this.bingRefreshTimer !== undefined) return;
    this.bingRefreshTimer = window.setInterval(
      () => void this._bingRefreshTick(),
      BING_REFRESH_MS,
    );
  }

  private _stopBingRefresh(): void {
    if (this.bingRefreshTimer !== undefined) {
      clearInterval(this.bingRefreshTimer);
      this.bingRefreshTimer = undefined;
    }
  }

  /** Re-fetch the Bing list; if the set of images changed, swap it in (keeping
   *  the current image where possible) and repaint. */
  private async _bingRefreshTick(): Promise<void> {
    const s = this._effective();
    if (
      String(s.background_mode ?? "solid") !== "slideshow" ||
      String(s.background_album ?? "builtin") !== "bing_pod"
    ) {
      this._stopBingRefresh();
      return;
    }
    const urls = await this._slideshowUrls(s);
    const changed =
      urls.length !== this.slideUrls.length || urls.some((u) => !this.slideUrls.includes(u));
    if (!changed || urls.length === 0) return;
    if (s.background_shuffle !== false) shuffle(urls);
    const currentUrl = this.slideUrls[this.slideIdx];
    this.slideUrls = urls;
    const idx = currentUrl ? urls.indexOf(currentUrl) : -1;
    this.slideIdx = idx >= 0 ? idx : 0;
    const gen = ++this.gen;
    await this._paint(s, this.slideUrls[this.slideIdx], gen);
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
