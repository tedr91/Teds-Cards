import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { appearanceLabel, transparencyBlurSchema } from "../../shared/appearance";
import { getMediaFolder, pickMedia } from "../../shared/media";
import { PHOTO_VIEWER_CARD_EDITOR_TYPE } from "./const";
import type { PhotoViewerCardConfig } from "./types";

const SOURCE_OPTIONS = [
  { value: "single", label: "Single photo" },
  { value: "album", label: "Folder album" },
];
const FIT_OPTIONS = [
  { value: "contain", label: "Contain (letterbox)" },
  { value: "cover", label: "Cover (fill frame)" },
];
const THEME_OPTIONS = [
  { value: "ha", label: "Home Assistant Theme" },
  { value: "ted-style", label: "Ted's Theme" },
];

@customElement(PHOTO_VIEWER_CARD_EDITOR_TYPE)
export class TedPhotoViewerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: PhotoViewerCardConfig;

  public setConfig(config: PhotoViewerCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const source = cfg.source ?? "single";
    const data = {
      source,
      image: cfg.image ?? "",
      folder: cfg.folder ?? "",
      fit: cfg.fit ?? "contain",
      fill: cfg.fill ?? false,
      open_last_on_load: cfg.open_last_on_load ?? false,
      theme: cfg.theme ?? "ha",
      background: cfg.background ?? "",
      transparency: cfg.transparency,
      blur: cfg.blur,
    };
    const isAlbum = source === "album";
    const topSchema = [
      {
        type: "expandable",
        name: "",
        title: "Appearance (general)",
        schema: [
          { name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } },
          { name: "background", selector: { ui_color: {} } },
          transparencyBlurSchema(cfg.transparency),
        ],
      },
      { name: "source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
    ];
    const bottomSchema = [
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "fit", selector: { select: { mode: "dropdown", options: FIT_OPTIONS } } },
          { name: "fill", selector: { boolean: {} } },
        ],
      },
      { name: "open_last_on_load", selector: { boolean: {} } },
    ];
    return html`<div class="editor">
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${topSchema}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <div class="media-field">
        <div class="mf-label">${isAlbum ? "Album folder (media-source URI)" : "Image (URL or media path)"}</div>
        <div class="mf-row">
          <input
            class="mf-input"
            type="text"
            .value=${isAlbum ? cfg.folder ?? "" : cfg.image ?? ""}
            placeholder=${isAlbum ? "media-source://…" : "https://… or media-source://…"}
            @change=${this._onMediaInput}
          />
          <button
            class="browse-btn"
            title=${isAlbum ? "Browse for a folder" : "Browse for an image"}
            @click=${this._browse}
          >
            <ha-icon icon="mdi:folder-image"></ha-icon>
            <span>Browse</span>
          </button>
        </div>
      </div>
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${bottomSchema}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    </div>`;
  }

  private _computeLabel = (schema: { name: string }): string => {
    const appearance = appearanceLabel(schema.name);
    if (appearance) return appearance;
    switch (schema.name) {
      case "source":
        return "Photo source";
      case "image":
        return "Image (URL or media path)";
      case "folder":
        return "Album folder (media-source URI)";
      case "fit":
        return "Image fit";
      case "fill":
        return "Fill available space";
      case "open_last_on_load":
        return "Re-open last photo on load";
      case "theme":
        return "Theme";
      case "background":
        return "Background color";
      default:
        return schema.name;
    }
  };

  private _computeHelper = (schema: { name: string }): string | undefined => {
    switch (schema.name) {
      case "folder":
        return "Leave empty to use the Photos album folder from Settings (needs backend integration).";
      case "open_last_on_load":
        return "For the Photos view: re-open the photo this device last viewed (else start empty).";
      default:
        return undefined;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const next = { ...this._config, ...ev.detail.value } as PhotoViewerCardConfig;
    if (!next.image) delete next.image;
    if (!next.folder) delete next.folder;
    if (!next.background) delete next.background;
    fireEvent(this, "config-changed", { config: next });
  };

  /** Commit the image (single) or folder (album) text field. */
  private _onMediaInput = (ev: Event): void => {
    const value = (ev.target as HTMLInputElement).value.trim();
    const key = (this._config?.source ?? "single") === "album" ? "folder" : "image";
    const next = { ...this._config } as PhotoViewerCardConfig;
    if (value) next[key] = value;
    else delete next[key];
    fireEvent(this, "config-changed", { config: next });
  };

  /** Open Home Assistant's media browser and set the image (single) or folder
   *  (album) from the user's pick. */
  private _browse = async (): Promise<void> => {
    if (!this.hass) return;
    const startFolder = (await getMediaFolder(this.hass)) ?? undefined;
    const uri = await pickMedia(this, this.hass, { accept: ["image/*"], startFolder });
    if (!uri) return;
    const next = { ...this._config } as PhotoViewerCardConfig;
    if ((next.source ?? "single") === "album") {
      // The picker returns a file; strip its last segment to get the folder URI.
      if (uri.includes("/")) next.folder = uri.replace(/\/[^/]*$/, "");
    } else {
      next.image = uri;
    }
    fireEvent(this, "config-changed", { config: next });
  };

  public static styles = css`
    .editor {
      display: block;
    }
    ha-form {
      display: block;
    }
    .media-field {
      margin: 12px 0 4px;
    }
    .mf-label {
      font-size: 0.75rem;
      color: var(--secondary-text-color);
      margin: 0 4px 6px;
    }
    .mf-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mf-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--divider-color, rgba(120, 120, 120, 0.3));
      background: var(--secondary-background-color, transparent);
      color: var(--primary-text-color);
      font: inherit;
    }
    .mf-input:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .browse-btn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid var(--divider-color, rgba(120, 120, 120, 0.3));
      background: var(--secondary-background-color, rgba(120, 120, 120, 0.1));
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .browse-btn:hover {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
      border-color: var(--primary-color);
    }
    .browse-btn ha-icon {
      --mdc-icon-size: 20px;
      color: var(--primary-color);
    }
  `;
}

