import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
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
} as const;

/** Resolve a photo-viewer icon (Fluent preferred, MDI fallback) to a string. */
function ic(spec: { mdi: string; fluent?: string }): string {
  return resolveIcon(spec) ?? `mdi:${spec.mdi}`;
}

const TOAST_MS = 2200;

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

  private _albumSig: string | null = null;
  private _albumLoaded = false;
  private _albumGen = 0;
  private _autoOpenTried = false;
  private _resolveGen = 0;
  private _toastTimer?: number;

  public constructor() {
    super();
    // Keep this device's settings live (folder / auto-open / last-viewed).
    new SettingsController(this, () => (this._backendInt() ? this.hass : undefined));
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
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
  }

  public setConfig(config: PhotoViewerCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    // Re-resolve the album + re-run the auto-open decision on config change.
    this._albumSig = null;
    this._albumLoaded = false;
    this._autoOpenTried = false;
    this._openedRef = null;
    this._displayUrl = null;
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

  private _backendInt(): boolean {
    return this._config?.backend_integration === true;
  }

  // --- Album resolution ------------------------------------------------------

  /** The album folder: card config wins; else the `photos_folder` setting when
   *  backend integration is on. */
  private _albumFolder(): string | undefined {
    const cfg = this._config;
    if (cfg?.folder) return cfg.folder;
    if (this._backendInt()) {
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
    if (e.key === "Escape" && this._openedRef) this._close();
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
    this._openedRef = ref;
    this._displayUrl = null;
    this._favorited = false;
    const gen = ++this._resolveGen;
    const url = await this._resolveRef(ref);
    if (gen !== this._resolveGen) return;
    this._displayUrl = url;
    if (this._backendInt()) settingsStore.setValue("device", "photos_last_viewed", ref);
  }

  private async _resolveRef(ref: string): Promise<string | null> {
    if (isMediaSourceUri(ref)) {
      return this.hass ? await resolveMediaSource(this.hass, ref) : null;
    }
    return ref;
  }

  private _close(): void {
    this._openedRef = null;
    this._displayUrl = null;
    this._controlsShown = false;
  }

  private _toggleControls(): void {
    this._controlsShown = !this._controlsShown;
  }

  // --- Actions ---------------------------------------------------------------

  private async _favorite(): Promise<void> {
    if (!this._backendInt() || !this.hass?.callWS || !this._displayUrl) return;
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
    if (!this._backendInt() || !this.hass?.callWS || !this._displayUrl) return;
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
    if (!this._backendInt()) return null;
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
    const style = appearanceStyle({
      background: cssColor(cfg.background),
      transparency: cfg.transparency,
      blur: cfg.blur,
    });
    return html`<div
      class="pv-root ${tedCardThemeClass(cfg.theme)} ${classMap({ fill: !!cfg.fill })}"
      style=${styleMap(style)}
    >
      ${this._openedRef ? this._renderPhoto() : this._renderEmpty()}
      ${this._toast ? html`<div class="pv-toast">${this._toast}</div>` : nothing}
    </div>`;
  }

  private _renderPhoto(): TemplateResult {
    const fit = this._config?.fit === "cover" ? "cover" : "contain";
    return html`<div
      class="pv-stage ${classMap({ shown: this._controlsShown })}"
      @click=${() => this._toggleControls()}
    >
      ${this._displayUrl
        ? html`<img class="pv-img" style="object-fit:${fit}" src=${this._displayUrl} alt="" />`
        : html`<div class="pv-loading"><ha-icon icon="mdi:loading" class="spin"></ha-icon></div>`}
      <div class="pv-controls" @click=${(e: Event) => e.stopPropagation()}>
        ${this._backendInt()
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
        <button class="pv-btn" title="Close" @click=${() => this._close()}>
          <ha-icon icon=${ic(IC.close)}></ha-icon>
        </button>
      </div>
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
      }
      .pv-img {
        width: 100%;
        height: 100%;
        display: block;
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
        top: 10px;
        right: 10px;
        display: flex;
        gap: 8px;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
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
