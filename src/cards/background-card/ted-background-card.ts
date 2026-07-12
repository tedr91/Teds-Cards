import { LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { SettingsController, settingsStore } from "../../shared/settings";
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
import { applyBackground, removeBackground } from "./background-dom";
import {
  BACKGROUND_CARD_DESCRIPTION,
  BACKGROUND_CARD_EDITOR_TYPE,
  BACKGROUND_CARD_NAME,
  BACKGROUND_CARD_TYPE,
} from "./const";
import type { BackgroundCardConfig } from "./types";

registerCustomCard({
  type: BACKGROUND_CARD_TYPE,
  name: BACKGROUND_CARD_NAME,
  description: BACKGROUND_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/Teds-Cards#background-card",
});

@customElement(BACKGROUND_CARD_TYPE)
export class TedBackgroundCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-background-card-editor");
    return document.createElement(BACKGROUND_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<BackgroundCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  /** Bumped on every (re)apply so stale async resolutions never win a race. */
  private _gen = 0;
  private _unsub?: () => void;
  private _slideTimer?: number;
  private _slideUrls: string[] = [];
  private _slideIdx = 0;
  private _lastDark?: boolean;

  public constructor() {
    super();
    // Keep this device's effective settings live (drives the wallpaper).
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsub = settingsStore.subscribe(() => this._apply());
    this._apply();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    this._stopSlideshow();
    removeBackground();
  }

  public setConfig(config: BackgroundCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
  }

  public getCardSize(): number {
    return 1;
  }

  protected updated(): void {
    // Re-apply when the theme's light/dark state flips (affects "match theme").
    const dark = this._isDark();
    if (dark !== this._lastDark) {
      this._lastDark = dark;
      this._apply();
    }
  }

  private _isDark(): boolean {
    return !!(this.hass as unknown as { themes?: { darkMode?: boolean } })?.themes?.darkMode;
  }

  /** Resolve a stored image ref (media-source:// or plain URL) to a usable URL. */
  private async _resolveRef(ref: string | null): Promise<string | null> {
    if (!ref) return null;
    if (isMediaSourceUri(ref) && this.hass) return resolveMediaSource(this.hass, ref);
    return ref;
  }

  private _apply(): void {
    const gen = ++this._gen;
    this._stopSlideshow();
    const s = settingsStore.effective();
    const mode = (s.background_mode as BackgroundMode) ?? "solid";

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
        if (gen === this._gen) applyBackground(backgroundLayerCss(s, url));
      });
      return;
    }
    // slideshow
    void this._startSlideshow(s, gen);
  }

  private async _startSlideshow(s: SettingsMap, gen: number): Promise<void> {
    const urls = await this._slideshowUrls(s);
    if (gen !== this._gen) return;

    if (s.background_shuffle !== false) shuffle(urls);
    if (!urls.length) {
      applyBackground(backgroundLayerCss(s, null));
      return;
    }

    this._slideUrls = urls;
    this._slideIdx = 0;
    applyBackground(backgroundLayerCss(s, urls[0]));

    if (urls.length < 2) return;
    const minutes = Math.max(1, Number(s.background_cycle_minutes ?? 30));
    this._slideTimer = window.setInterval(() => {
      this._slideIdx = (this._slideIdx + 1) % this._slideUrls.length;
      applyBackground(backgroundLayerCss(settingsStore.effective(), this._slideUrls[this._slideIdx]));
    }, minutes * 60_000);
  }

  /** Build the (unshuffled) list of image URLs for the current slideshow source. */
  private async _slideshowUrls(s: SettingsMap): Promise<string[]> {
    if (!this.hass) return [];
    if (s.background_album === "folder") {
      const folder = typeof s.background_folder === "string" ? s.background_folder : "";
      if (!folder) return [];
      const uris = await listFolderImages(this.hass, folder);
      const resolved = await Promise.all(uris.map((u) => this._resolveRef(u)));
      return resolved.filter((u): u is string => !!u);
    }
    // builtin album, filtered by type preference
    const cat = await listBuiltinBackgrounds(this.hass);
    const pref = (s.background_type_pref as BackgroundTypePref) ?? "match";
    if (pref === "all") return [...cat.general, ...cat.light, ...cat.dark];
    if (pref === "light") return [...cat.light, ...cat.general];
    if (pref === "dark") return [...cat.dark, ...cat.general];
    // match theme
    return this._isDark() ? [...cat.dark, ...cat.general] : [...cat.light, ...cat.general];
  }

  private _stopSlideshow(): void {
    if (this._slideTimer !== undefined) {
      clearInterval(this._slideTimer);
      this._slideTimer = undefined;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    return nothing;
  }
}

/** In-place Fisher–Yates shuffle. */
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
