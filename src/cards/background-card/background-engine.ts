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
  backgroundLayerCss,
  type BackgroundMode,
  type BackgroundTypePref,
} from "../../shared/background";
import type { SettingsMap } from "../../shared/settings-schema";
import {
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

  private slideUrls: string[] = [];
  private slideIdx = 0;
  private slideSig?: string;
  private cycleMin?: number;
  private timer?: number;
  private lastDark?: boolean;

  /** A card connected: keep the engine live and paint the current wallpaper. */
  attach(hass: HassLike | undefined): void {
    this.refCount++;
    this.hass = hass;
    this.lastDark = this._isDark();
    if (!this.unsub) this.unsub = settingsStore.subscribe(() => this.apply());
    this.apply();
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
    const s = settingsStore.effective();
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
        if (gen === this.gen) applyBackground(backgroundLayerCss(s, url));
      });
      return;
    }
    void this._applySlideshow(s, gen);
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
    applyBackground(backgroundLayerCss(s, this.slideUrls[this.slideIdx]));

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
      applyBackground(backgroundLayerCss(settingsStore.effective(), this.slideUrls[this.slideIdx]));
    }, cycleMinutes * 60_000);
  }

  private _stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async _slideshowUrls(s: SettingsMap): Promise<string[]> {
    if (!this.hass) return [];
    if (s.background_album === "folder") {
      const folder = typeof s.background_folder === "string" ? s.background_folder : "";
      if (!folder) return [];
      const uris = await listFolderImages(this.hass, folder);
      const resolved = await Promise.all(uris.map((u) => this._resolveRef(u)));
      return resolved.filter((u): u is string => !!u);
    }
    const cat = await listBuiltinBackgrounds(this.hass);
    const pref = (s.background_type_pref as BackgroundTypePref) ?? "match";
    if (pref === "all") return [...cat.general, ...cat.light, ...cat.dark];
    if (pref === "light") return [...cat.light, ...cat.general];
    if (pref === "dark") return [...cat.dark, ...cat.general];
    return this._isDark() ? [...cat.dark, ...cat.general] : [...cat.light, ...cat.general];
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
