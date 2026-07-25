import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { appearanceStyle, cssColor } from "../../shared/appearance";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { resolveIcon } from "../../shared/icons";
import { SettingsController, settingsStore } from "../../shared/settings";
import { applyBgImage } from "../../shared/background";
import { isMediaSourceUri, listFolderImages, resolveMediaSource } from "../../shared/media";
import { showPrompt } from "../../shared/dialogs";
import {
  PHOTO_VIEWER_CARD_DESCRIPTION,
  PHOTO_VIEWER_CARD_EDITOR_TYPE,
  PHOTO_VIEWER_CARD_NAME,
  PHOTO_VIEWER_CARD_TYPE,
} from "./const";
import type { PhotoViewerCardConfig } from "./types";

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

/** Photo-viewer icons as `{ fluent, mdi }` maps (Fluent preferred, MDI fallback). */
const IC = {
  photo: { fluent: "image-24-regular", mdi: "image-outline" },
  favorite: { fluent: "star-24-regular", mdi: "star-outline" },
  favoriteOn: { fluent: "star-24-filled", mdi: "star" },
  wallpaper: { fluent: "image-multiple-24-regular", mdi: "wallpaper" },
  close: { fluent: "dismiss-24-filled", mdi: "close" },
  settings: { fluent: "settings-24-regular", mdi: "cog-outline" },
  open: { fluent: "image-search-24-regular", mdi: "image-search-outline" },
  prev: { fluent: "chevron-left-24-filled", mdi: "chevron-left" },
  next: { fluent: "chevron-right-24-filled", mdi: "chevron-right" },
  slideshow: { fluent: "play-24-filled", mdi: "play" },
  stop: { fluent: "pause-24-filled", mdi: "pause" },
} as const;

/** Resolve a photo-viewer icon (Fluent preferred, MDI fallback) to a string. */
function ic(spec: { mdi: string; fluent?: string }): string {
  return resolveIcon(spec) ?? `mdi:${spec.mdi}`;
}

const TOAST_MS = 2200;

/** Auto-slideshow interval choices shown in the duration popup. */
const SLIDE_DURATIONS: { label: string; sec: number }[] = [
  { label: "10 seconds", sec: 10 },
  { label: "30 seconds", sec: 30 },
  { label: "1 minute", sec: 60 },
  { label: "5 minutes", sec: 300 },
  { label: "15 minutes", sec: 900 },
  { label: "30 minutes", sec: 1800 },
];
const DEFAULT_SLIDE_SEC = 300;
/** Minimum pointer travel (px) to count as a swipe rather than a tap. */
const SWIPE_MIN_PX = 45;

@customElement(PHOTO_VIEWER_CARD_TYPE)
export class TedPhotoViewerCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-photo-viewer-card-editor");
    return document.createElement(PHOTO_VIEWER_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<PhotoViewerCardConfig, "type"> {
    return { source: "single" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;

  @state() private _config?: PhotoViewerCardConfig;
  /** The ref (stable identity) of the currently open photo, or null when closed. */
  @state() private _openedRef: string | null = null;
  /** The resolved, fetchable URL for the open photo. */
  @state() private _displayUrl: string | null = null;
  @state() private _albumRefs: string[] = [];
  @state() private _favorited = false;
  @state() private _toast: string | null = null;
  @state() private _controlsShown = false;
  @state() private _fadeUrl: string | null = null;
  @state() private _fading = false;
  @state() private _slideshow = false;
  @state() private _durationPickerOpen = false;
  @state() private _fitOverride: "cover" | "contain" | null = null;

  private _albumSig: string | null = null;
  private _albumLoaded = false;
  private _albumGen = 0;
  private _autoOpenTried = false;
  private _resolveGen = 0;
  private _toastTimer?: number;
  private _fadeGen = 0;
  private _slideDurationSec = DEFAULT_SLIDE_SEC;
  private _slideTimer?: number;
  private _urlCache = new Map<string, string>();
  private _swipeStart: { x: number; y: number } | null = null;
  private _suppressClick = false;

  public constructor() {
    super();
    // Keep this device's settings live (folder / auto-open / last-viewed).
    new SettingsController(this, () => (this._backendIntegration() ? this.hass : undefined));
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._onLocationChanged);
    window.addEventListener("popstate", this._onLocationChanged);
    document.addEventListener("keydown", this._onKeyDown);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
    document.removeEventListener("keydown", this._onKeyDown);
    this._stopSlideshow();
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
  }

  public setConfig(config: PhotoViewerCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    // Re-resolve the album + re-run the auto-open decision on config change.
    this._stopSlideshow();
    this._albumSig = null;
    this._albumLoaded = false;
    this._autoOpenTried = false;
    this._openedRef = null;
    this._displayUrl = null;
    this._fadeUrl = null;
    this._fading = false;
    this._fitOverride = null;
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): GridOptions {
    return { columns: 12, rows: 5, min_columns: 6, min_rows: 3 };
  }

  protected updated(): void {
    void this._ensureAlbum();
    this._maybeAutoOpen();
  }

  private _backendIntegration(): boolean {
    return this._config?.backend_integration === true;
  }

  // --- Album resolution ------------------------------------------------------

  /** The album folder: card config wins; else the `photos_folder` setting when
   *  backend integration is on. */
  private _albumFolder(): string | undefined {
    const cfg = this._config;
    if (cfg?.folder) return cfg.folder;
    if (this._backendIntegration()) {
      const f = settingsStore.effective().photos_folder;
      if (typeof f === "string" && f) return f;
    }
    return undefined;
  }

  private async _ensureAlbum(): Promise<void> {
    if (this._config?.source !== "album" || !this.hass) return;
    const folder = this._albumFolder() ?? "";
    if (folder === this._albumSig) return;
    this._albumSig = folder;
    this._albumLoaded = false;
    this._albumRefs = [];
    if (!folder) {
      this._albumLoaded = true;
      this.requestUpdate();
      return;
    }
    const gen = ++this._albumGen;
    const uris = await listFolderImages(this.hass, folder);
    if (gen !== this._albumGen) return;
    this._albumRefs = uris;
    this._albumLoaded = true;
    void this._prewarm();
    this.requestUpdate();
  }

  // --- Auto-open / deep-link -------------------------------------------------

  private _maybeAutoOpen(): void {
    if (this._autoOpenTried || !this.hass || !this._config) return;
    if (this._config.source === "album" && !this._albumLoaded) return;
    this._autoOpenTried = true;

    const deep = this._deepLinkRef();
    if (deep) {
      void this._openRef(deep);
      return;
    }
    if (this._config.open_last_on_load) {
      if (settingsStore.effective().photos_auto_open_last !== false) {
        const last = this._lastViewed();
        if (last && this._refValid(last)) void this._openRef(last);
      }
      return;
    }
    void this._openInitial();
  }

  private _lastViewed(): string | null {
    const v =
      settingsStore.deviceSettings().photos_last_viewed ??
      settingsStore.effective().photos_last_viewed;
    return typeof v === "string" && v ? v : null;
  }

  private _refValid(ref: string): boolean {
    if (this._config?.source === "album") {
      return (
        this._albumRefs.includes(ref) ||
        this._albumRefs.some((r) => this._basename(r) === this._basename(ref))
      );
    }
    return !!this._config?.image && ref === this._config.image;
  }

  private _deepLinkRef(): string | null {
    const param = this._config?.url_param || "photo";
    let raw: string | null = null;
    try {
      raw = new URLSearchParams(window.location.search).get(param);
    } catch {
      raw = null;
    }
    if (!raw) return null;
    if (this._config?.source === "album") {
      const refs = this._albumRefs;
      const exact = refs.find((r) => r === raw);
      if (exact) return exact;
      const byName = refs.find(
        (r) => this._basename(r) === raw || this._basename(r) === this._basename(raw),
      );
      if (byName) return byName;
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0 && n < refs.length) return refs[n];
      return null;
    }
    return this._config?.image ?? null;
  }

  private _basename(ref: string): string {
    return ref.split("?")[0].split("/").pop() ?? ref;
  }

  private _onLocationChanged = (): void => {
    const deep = this._deepLinkRef();
    if (deep && deep !== this._openedRef) void this._openRef(deep);
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._openedRef) return;
    if (this._config?.source !== "album" || this._albumRefs.length < 2) return;
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      this._advance(1, true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      this._advance(-1, true);
    }
  };

  // --- Open / close ----------------------------------------------------------

  private _openInitial(): void {
    if (this._config?.source === "album") {
      if (this._albumRefs.length) void this._openRef(this._albumRefs[0]);
      return;
    }
    if (this._config?.image) void this._openRef(this._config.image);
  }

  private async _openRef(ref: string): Promise<void> {
    const prevUrl = this._displayUrl;
    this._openedRef = ref;
    this._favorited = false;
    const gen = ++this._resolveGen;
    const url = await this._resolveRef(ref);
    if (gen !== this._resolveGen) return;

    const crossfade =
      this._config?.source === "album" &&
      this._transitionMode() === "crossfade" &&
      !!prevUrl &&
      !!url &&
      url !== prevUrl;
    if (crossfade) {
      this._fadeUrl = prevUrl;
      this._displayUrl = url;
      this._fading = true;
      const fadeGen = ++this._fadeGen;
      window.setTimeout(
        () => {
          if (fadeGen !== this._fadeGen) return;
          this._fadeUrl = null;
          this._fading = false;
        },
        this._crossfadeSec() * 1000 + 120,
      );
    } else {
      this._displayUrl = url;
      this._fadeUrl = null;
      this._fading = false;
    }
    if (this._backendIntegration()) settingsStore.setValue("device", "photos_last_viewed", ref);
  }

  private async _resolveRef(ref: string): Promise<string | null> {
    const cached = this._urlCache.get(ref);
    if (cached) return cached;
    let url: string | null = ref;
    if (isMediaSourceUri(ref)) {
      url = this.hass ? await resolveMediaSource(this.hass, ref) : null;
    }
    if (url) this._urlCache.set(ref, url);
    return url;
  }

  /** Pre-resolve every album ref so navigation + slideshow are instant. */
  private async _prewarm(): Promise<void> {
    const gen = this._albumGen;
    for (const ref of this._albumRefs) {
      if (gen !== this._albumGen) return;
      if (!this._urlCache.has(ref)) await this._resolveRef(ref);
    }
  }

  private _toggleControls(): void {
    this._controlsShown = !this._controlsShown;
    this._durationPickerOpen = false;
  }

  /** Effective image fit: a runtime swipe override wins over the config. */
  private _effectiveFit(): "cover" | "contain" {
    if (this._fitOverride) return this._fitOverride;
    return this._config?.fit === "cover" ? "cover" : "contain";
  }

  // --- Swipe gestures (native pointer events; HA has no gesture API) ----------

  private _onStageDown = (e: PointerEvent): void => {
    if (!e.isPrimary) {
      this._swipeStart = null;
      return;
    }
    this._swipeStart = { x: e.clientX, y: e.clientY };
  };

  private _onStageUp = (e: PointerEvent): void => {
    const s = this._swipeStart;
    this._swipeStart = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (Math.max(adx, ady) < SWIPE_MIN_PX) return;
    // A real swipe happened: suppress the tap-to-toggle click that follows.
    this._suppressClick = true;
    window.setTimeout(() => {
      this._suppressClick = false;
    }, 350);
    if (adx > ady) {
      // Horizontal: swipe right -> next, swipe left -> previous (album only).
      if (this._config?.source === "album" && this._albumRefs.length > 1) {
        this._advance(dx > 0 ? 1 : -1, true);
      }
    } else {
      // Vertical: swipe up -> Fill (cover), swipe down -> Contain.
      this._fitOverride = dy < 0 ? "cover" : "contain";
    }
  };

  private _onStageClick = (): void => {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    this._toggleControls();
  };

  // --- Album navigation + slideshow -----------------------------------------

  private _transitionMode(): string {
    return settingsStore.effective().photos_slideshow_transition === "none" ? "none" : "crossfade";
  }

  private _crossfadeSec(): number {
    const v = Number(settingsStore.effective().photos_slideshow_crossfade_seconds);
    return Number.isFinite(v) && v >= 0 ? v : 2;
  }

  private _advance(delta: number, manual = true): void {
    const refs = this._albumRefs;
    if (refs.length === 0) return;
    const cur = this._openedRef ? refs.indexOf(this._openedRef) : -1;
    const idx = (cur + delta + refs.length) % refs.length;
    void this._openRef(refs[idx]);
    if (manual && this._slideshow) this._restartSlideTimer();
  }

  private _toggleSlideshow(): void {
    if (this._slideshow) {
      this._stopSlideshow();
      return;
    }
    this._durationPickerOpen = !this._durationPickerOpen;
  }

  private _startSlideshow(sec: number): void {
    this._slideDurationSec = sec;
    this._slideshow = true;
    this._durationPickerOpen = false;
    this._restartSlideTimer();
  }

  private _restartSlideTimer(): void {
    if (this._slideTimer) window.clearInterval(this._slideTimer);
    this._slideTimer = window.setInterval(
      () => this._advance(1, false),
      Math.max(1, this._slideDurationSec) * 1000,
    );
  }

  private _stopSlideshow(): void {
    this._slideshow = false;
    this._durationPickerOpen = false;
    if (this._slideTimer) {
      window.clearInterval(this._slideTimer);
      this._slideTimer = undefined;
    }
  }

  private async _customDuration(): Promise<void> {
    const raw = await showPrompt(this, {
      title: "Custom slideshow interval",
      text: "How many seconds between photos?",
      placeholder: "e.g. 120",
      confirmText: "Start",
      multiline: false,
    });
    if (raw == null) return;
    const sec = Math.round(Number(raw.trim()));
    if (Number.isFinite(sec) && sec >= 1) this._startSlideshow(sec);
  }

  // --- Actions ---------------------------------------------------------------

  private async _favorite(): Promise<void> {
    if (!this._backendIntegration() || !this.hass?.callWS || !this._displayUrl) return;
    try {
      const r = await this.hass.callWS<{ success?: boolean }>({
        type: "teds_cards_backend/favorite_photo",
        ref: this._displayUrl,
      });
      if (r?.success) {
        this._favorited = true;
        this._flash("Favorited");
      } else {
        this._flash("Couldn't favorite");
      }
    } catch {
      this._flash("Couldn't favorite");
    }
  }

  private async _setAsBackground(): Promise<void> {
    if (!this._backendIntegration() || !this.hass?.callWS || !this._displayUrl) return;
    this._flash("Saving wallpaper…");
    try {
      const r = await this.hass.callWS<{ success?: boolean; url?: string }>({
        type: "teds_cards_backend/store_background_photo",
        ref: this._displayUrl,
      });
      if (r?.success && r.url) {
        applyBgImage(
          (k) => settingsStore.effective()[k],
          (k, v) => settingsStore.setValue("device", k, v),
          r.url,
        );
        settingsStore.setValue("device", "background_mode", "image");
        this._flash("Set as wallpaper");
      } else {
        this._flash("Couldn't set wallpaper");
      }
    } catch {
      this._flash("Couldn't set wallpaper");
    }
  }

  private _flash(msg: string): void {
    this._toast = msg;
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this._toast = null;
    }, TOAST_MS);
  }

  // --- Settings navigation ---------------------------------------------------

  private _settingsPath(): string | null {
    if (this._config?.settings_path) return this._resolveRoot(this._config.settings_path);
    if (!this._backendIntegration()) return null;
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    return `/${root}/settings?tab=photos&scope=device`;
  }

  private _resolveRoot(path: string): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    return "/" + path.replace(/^\/+/, "").replace(/^\[root\]\/?/, `${root}/`);
  }

  private _navigate(path: string): void {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;
    // While viewing, the stage supplies the matte; keep the root transparent so a
    // translucent matte reveals the dashboard wallpaper (not the card surface). In
    // the empty state the root shows the themed/appearance surface.
    const style: Record<string, string> = this._openedRef
      ? { background: "transparent" }
      : appearanceStyle({
          background: cssColor(cfg.background),
          transparency: cfg.transparency,
          blur: cfg.blur,
        });
    return html`<div
      class="pv-root ${tedCardThemeClass(cfg.theme)}${cfg.fill ? " fill" : ""}"
      style=${styleMap(style)}
    >
      ${this._openedRef ? this._renderPhoto() : this._renderEmpty()}
      ${this._toast ? html`<div class="pv-toast">${this._toast}</div>` : nothing}
    </div>`;
  }

  private _renderPhoto(): TemplateResult {
    const cfg = this._config;
    const fit = this._effectiveFit();
    const album = cfg?.source === "album";
    const canNav = album && this._albumRefs.length > 1;
    const fadeSec = this._crossfadeSec();
    const topClass = `pv-img top${this._fading ? " xf" : ""}`;
    // The stage is the matte behind the photo: default black, but the Appearance
    // background/transparency/blur recolor it (and let the wallpaper show through
    // the letterbox bars when translucent).
    const stageStyle = appearanceStyle({
      background: cssColor(cfg?.background) ?? "#000",
      transparency: cfg?.transparency,
      blur: cfg?.blur,
    });
    return html`<div
      class="pv-stage${this._controlsShown ? " shown" : ""}"
      style=${styleMap(stageStyle)}
      @pointerdown=${this._onStageDown}
      @pointerup=${this._onStageUp}
      @click=${this._onStageClick}
    >
      ${this._fadeUrl
        ? keyed(
            this._fadeUrl,
            html`<img
              class="pv-img base"
              style="object-fit:${fit};--pv-fade:${fadeSec}s"
              src=${this._fadeUrl}
              alt=""
            />`,
          )
        : nothing}
      ${this._displayUrl
        ? keyed(
            this._displayUrl,
            html`<img
              class=${topClass}
              style="object-fit:${fit};--pv-fade:${fadeSec}s"
              src=${this._displayUrl}
              alt=""
            />`,
          )
        : html`<div class="pv-loading"><ha-icon icon="mdi:loading" class="spin"></ha-icon></div>`}
      ${canNav
        ? html`<button
              class="pv-pill left"
              title="Previous"
              @click=${(e: Event) => {
                e.stopPropagation();
                this._advance(-1, true);
              }}
            >
              <ha-icon icon=${ic(IC.prev)}></ha-icon>
            </button>
            <button
              class="pv-pill right"
              title="Next"
              @click=${(e: Event) => {
                e.stopPropagation();
                this._advance(1, true);
              }}
            >
              <ha-icon icon=${ic(IC.next)}></ha-icon>
            </button>`
        : nothing}
      <div class="pv-controls" @click=${(e: Event) => e.stopPropagation()}>
        ${this._backendIntegration()
          ? html`<button
                class="pv-btn"
                title="Favorite"
                @click=${() => void this._favorite()}
              >
                <ha-icon icon=${ic(this._favorited ? IC.favoriteOn : IC.favorite)}></ha-icon>
              </button>
              <button
                class="pv-btn"
                title="Set as background"
                @click=${() => void this._setAsBackground()}
              >
                <ha-icon icon=${ic(IC.wallpaper)}></ha-icon>
              </button>`
          : nothing}
        ${album
          ? html`<button
              class="pv-btn"
              title=${this._slideshow ? "Stop slideshow" : "Slideshow"}
              @click=${() => this._toggleSlideshow()}
            >
              <ha-icon icon=${ic(this._slideshow ? IC.stop : IC.slideshow)}></ha-icon>
            </button>`
          : nothing}
        ${this._durationPickerOpen ? this._renderDurationMenu() : nothing}
      </div>
    </div>`;
  }

  private _renderDurationMenu(): TemplateResult {
    return html`<div class="pv-menu" @click=${(e: Event) => e.stopPropagation()}>
      <div class="pv-menu-title">Slideshow every…</div>
      ${SLIDE_DURATIONS.map(
        (d) => html`<button class="pv-menu-item" @click=${() => this._startSlideshow(d.sec)}>
          ${d.label}
        </button>`,
      )}
      <button class="pv-menu-item" @click=${() => void this._customDuration()}>Custom…</button>
    </div>`;
  }

  private _renderEmpty(): TemplateResult {
    const cfg = this._config;
    const album = cfg?.source === "album";
    const canOpen = album ? this._albumRefs.length > 0 : !!cfg?.image;
    const title = cfg?.empty_title ?? "No photo open";
    const message =
      cfg?.empty_message ??
      (album
        ? this._albumLoaded && this._albumRefs.length === 0
          ? "No photos found in this album."
          : "Open the album to start viewing."
        : cfg?.image
          ? "Open a photo to start viewing."
          : "No photo configured.");
    const settingsPath = this._settingsPath();
    return html`<div class="pv-empty">
      <ha-icon class="pv-empty-icon" icon=${ic(IC.photo)}></ha-icon>
      <div class="pv-empty-title">${title}</div>
      <div class="pv-empty-msg">${message}</div>
      <div class="pv-empty-actions">
        ${canOpen
          ? html`<button class="pv-cta" @click=${() => this._openInitial()}>
              <ha-icon icon=${ic(IC.open)}></ha-icon>
              <span>${album ? "Open album" : "Open photo"}</span>
            </button>`
          : nothing}
        ${settingsPath
          ? html`<button class="pv-cta ghost" @click=${() => this._navigate(settingsPath)}>
              <ha-icon icon=${ic(IC.settings)}></ha-icon><span>Settings</span>
            </button>`
          : nothing}
      </div>
    </div>`;
  }

  public static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }
      .pv-root {
        position: relative;
        display: flex;
        width: 100%;
        height: 100%;
        min-height: 180px;
        border-radius: var(--ted-style-radius, 8px);
        overflow: hidden;
        background: var(--ted-style-surface, var(--ha-card-background, #1c1c1c));
        color: var(--ted-style-text, var(--primary-text-color));
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .pv-root.fill {
        height: 100%;
      }
      .pv-stage {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
        touch-action: none;
      }
      .pv-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }
      .pv-img.base {
        z-index: 0;
        animation: pv-fade-out var(--pv-fade, 2s) ease both;
      }
      @keyframes pv-fade-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      .pv-img.top {
        z-index: 1;
        opacity: 1;
      }
      .pv-img.top.xf {
        animation: pv-fade-in var(--pv-fade, 2s) ease both;
      }
      @keyframes pv-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .pv-pill {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2;
        width: 18px;
        height: 64px;
        border: none;
        border-radius: var(--ted-style-radius, 8px);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        background: rgba(0, 0, 0, 0.32);
        opacity: 0.16;
        transition: opacity 0.2s ease, background 0.2s ease;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      .pv-pill.left {
        left: 10px;
      }
      .pv-pill.right {
        right: 10px;
      }
      .pv-stage:hover .pv-pill,
      .pv-stage.shown .pv-pill {
        opacity: 0.9;
      }
      .pv-pill:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.55);
      }
      .pv-pill ha-icon {
        --mdc-icon-size: 28px;
        transform: scale(0.75, 1.5);
      }
      .pv-loading {
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
      .spin {
        animation: pv-spin 1s linear infinite;
      }
      @keyframes pv-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .pv-controls {
        position: absolute;
        bottom: 10px;
        right: 10px;
        z-index: 3;
        display: flex;
        gap: 8px;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
      }
      .pv-menu {
        position: absolute;
        bottom: 52px;
        right: 0;
        z-index: 4;
        min-width: 176px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: rgba(20, 20, 20, 0.92);
        color: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .pv-menu-title {
        font-size: 0.7rem;
        opacity: 0.7;
        padding: 4px 10px 6px;
      }
      .pv-menu-item {
        -webkit-appearance: none;
        appearance: none;
        border: none;
        cursor: pointer;
        text-align: left;
        padding: 8px 10px;
        border-radius: 8px;
        background: transparent;
        color: #fff;
        font: inherit;
      }
      .pv-menu-item:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .pv-stage:hover .pv-controls,
      .pv-stage.shown .pv-controls {
        opacity: 1;
        pointer-events: auto;
      }
      .pv-btn {
        -webkit-appearance: none;
        appearance: none;
        border: none;
        cursor: pointer;
        width: 40px;
        height: 40px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      .pv-btn:hover {
        background: rgba(0, 0, 0, 0.65);
      }
      .pv-btn ha-icon {
        --mdc-icon-size: 22px;
      }
      .pv-empty {
        flex: 1 1 auto;
        box-sizing: border-box;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 32px 24px;
        text-align: center;
      }
      .pv-empty-icon {
        --mdc-icon-size: 48px;
        color: var(--ted-style-muted, var(--secondary-text-color));
        margin-bottom: 6px;
      }
      .pv-empty-title {
        font-size: 1.1rem;
        font-weight: 600;
      }
      .pv-empty-msg {
        color: var(--ted-style-muted, var(--secondary-text-color));
        max-width: 320px;
      }
      .pv-empty-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .pv-cta {
        -webkit-appearance: none;
        appearance: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 999px;
        border: none;
        background: var(--ted-style-accent, var(--primary-color));
        color: var(--ted-style-on-accent, #fff);
        font: inherit;
        font-weight: 600;
      }
      .pv-cta.ghost {
        background: color-mix(in srgb, var(--ted-style-text, currentColor) 12%, transparent);
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .pv-cta ha-icon {
        --mdc-icon-size: 20px;
      }
      .pv-toast {
        position: absolute;
        bottom: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.72);
        color: #fff;
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 0.9rem;
        pointer-events: none;
        z-index: 3;
      }
    `,
  ];
}

registerCustomCard({
  type: PHOTO_VIEWER_CARD_TYPE,
  name: PHOTO_VIEWER_CARD_NAME,
  description: PHOTO_VIEWER_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#photo-viewer-card",
});
