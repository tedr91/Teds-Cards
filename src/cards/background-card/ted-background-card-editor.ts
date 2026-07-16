import { LitElement, css, html, nothing, type CSSResultGroup, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent, type HomeAssistant, type LovelaceCardEditor } from "custom-card-helpers";

import {
  applyBgImage,
  backgroundFieldsStyles,
  renderBackgroundFields,
  type BackgroundFieldsCtx,
} from "../../shared/background";
import type { SettingsValue } from "../../shared/settings-schema";
import { showConfirmation } from "../../shared/dialogs";
import {
  getMediaFolder,
  isMediaSourceUri,
  pickMedia,
  resolveMediaSource,
  uploadImage,
  uploadToMediaFolder,
} from "../../shared/media";
import { BACKGROUND_CARD_EDITOR_TYPE } from "./const";
import type { BackgroundCardConfig } from "./types";

@customElement(BACKGROUND_CARD_EDITOR_TYPE)
export class TedBackgroundCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: BackgroundCardConfig;
  @state() private _mediaFolder: string | null = null;
  private _thumbs = new Map<string, string>();

  public setConfig(config: BackgroundCardConfig): void {
    this._config = config;
  }

  protected updated(): void {
    // Discover the "Ted Dash System" media folder only when integrated.
    if (this._config?.backend_integration && this.hass && this._mediaFolder === null) {
      void getMediaFolder(this.hass).then((f) => {
        if (f) this._mediaFolder = f;
      });
    }
  }

  private _get(key: string): SettingsValue | undefined {
    return (this._config as Record<string, unknown> | undefined)?.[key] as SettingsValue | undefined;
  }

  private _set(key: string, value: SettingsValue): void {
    const config = { ...(this._config ?? { type: "" }), [key]: value } as BackgroundCardConfig;
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _displayUrl(ref: string): string {
    if (!isMediaSourceUri(ref)) return ref;
    const cached = this._thumbs.get(ref);
    if (cached) return cached;
    if (this.hass) {
      void resolveMediaSource(this.hass, ref).then((url) => {
        if (url) {
          this._thumbs.set(ref, url);
          this.requestUpdate();
        }
      });
    }
    return "";
  }

  private async _selectImage(): Promise<void> {
    if (!this.hass) return;
    const uri = await pickMedia(this, this.hass, { accept: ["image/*"], startFolder: this._mediaFolder ?? undefined });
    if (uri) applyBgImage((k) => this._get(k), (k, v) => this._set(k, v), uri);
  }

  private async _uploadImage(file: File): Promise<void> {
    if (!this.hass) return;
    const url = this._mediaFolder
      ? await uploadToMediaFolder(this.hass, file, this._mediaFolder)
      : await uploadImage(this.hass, file);
    if (url) applyBgImage((k) => this._get(k), (k, v) => this._set(k, v), url);
  }

  private async _pickFolder(): Promise<void> {
    if (!this.hass) return;
    const uri = await pickMedia(this, this.hass, { accept: ["image/*"], startFolder: this._mediaFolder ?? undefined });
    if (uri && uri.includes("/")) this._set("background_folder", uri.replace(/\/[^/]*$/, ""));
  }

  /** Clear the HA-wide Bing "Photo of the Day" cache. */
  private async _clearBingCache(): Promise<void> {
    if (!this.hass) return;
    const ok = await showConfirmation(this, {
      title: "Clear Bing photo cache?",
      text: "This deletes the downloaded Bing “Photo of the Day” images for the whole Home Assistant instance. They re-download the next time the slideshow runs.",
      confirmText: "Clear",
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.hass.callWS({ type: "teds_cards_backend/clear_bing_photos_cache" });
    } catch {
      /* best-effort */
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const backendInt = this._config.backend_integration === true;
    const ctx: BackgroundFieldsCtx = {
      get: (k) => this._get(k),
      set: (k, v) => this._set(k, v),
      disabled: false,
      backendAvailable: backendInt,
      mediaFolder: this._mediaFolder,
      displayUrl: (ref) => this._displayUrl(ref),
      selectImage: () => void this._selectImage(),
      uploadImage: (f) => void this._uploadImage(f),
      clearImage: () => this._set("background_image", null),
      selectRecent: (ref) => applyBgImage((k) => this._get(k), (k, v) => this._set(k, v), ref),
      pickFolder: () => void this._pickFolder(),
      clearBingCache: () => void this._clearBingCache(),
    };

    return html`
      <div class="editor">
        <div class="bg-field">
          <div class="row-label">
            <span>Use Ted's Cards Backend</span>
            <span class="help">
              Sync with per-device Settings and serve built-in wallpapers locally. Off = a
              self-contained card that stores its wallpaper in the card config.
            </span>
          </div>
          <div class="row-control">
            <ha-switch
              .checked=${backendInt}
              @change=${(e: Event) => this._set("backend_integration", (e.target as HTMLInputElement).checked)}
            ></ha-switch>
          </div>
        </div>
        ${renderBackgroundFields(ctx)}
      </div>
    `;
  }

  static styles: CSSResultGroup = [
    backgroundFieldsStyles,
    css`
      :host {
        display: block;
      }
      .editor {
        display: flex;
        flex-direction: column;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-background-card-editor": TedBackgroundCardEditor;
  }
}
