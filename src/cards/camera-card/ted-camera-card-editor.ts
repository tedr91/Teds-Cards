import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { CAMERA_CARD_EDITOR_TYPE } from "./const";
import type { CameraCardConfig } from "./types";

// mdi:palette — Appearance section
const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:gesture-tap — Interactions section
const INTERACTIONS_ICON_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.13V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.59,17.28H6.75L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";

/** Default-action target for the more-info dropdowns: our `entity` field. */
const ACTION_CONTEXT = { entity_id: "entity" } as const;

/** Square size (px) used for width/height when embedded as a room-card button. */
const EMBEDDED_BUTTON_SIZE = 100;

@customElement(CAMERA_CARD_EDITOR_TYPE)
export class TedCameraCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Set by the room card when this editor is embedded as a fixed-size button. */
  @property({ attribute: false }) public embedded = false;
  @state() private _config?: CameraCardConfig;

  public setConfig(config: CameraCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    const data = { ...this._defaults(), ...this._config };
    const schema = this._schema();

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${schema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  private _defaults(): Partial<CameraCardConfig> {
    return {
      theme: "ted-style",
      brushed: false,
      transparency: undefined,
      blur: undefined,
      camera_view: "auto",
      fit_mode: "cover",
      show_name: false,
      width: this.embedded ? EMBEDDED_BUTTON_SIZE : 240,
      height: this.embedded ? EMBEDDED_BUTTON_SIZE : 135,
    };
  }

  private _schema() {
    const inGrid = Boolean(this._config?.grid_options);
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "camera" } },
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          {
            name: "camera_view",
            required: true,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "auto", label: "Auto thumbnail (default)" },
                  { value: "live", label: "Live stream" },
                ],
              },
            },
          },
          {
            name: "fit_mode",
            required: true,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "cover", label: "Cover (default)" },
                  { value: "contain", label: "Contain" },
                  { value: "fill", label: "Fill" },
                ],
              },
            },
          },
        ],
      },
      { name: "aspect_ratio", selector: { text: {} } },
      {
        name: "",
        type: "expandable",
        title: "Appearance",
        iconPath: VISUAL_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "theme",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "ted-style", label: "Ted's Style (default)" },
                  { value: "ha", label: "Home Assistant theme" },
                ],
              },
            },
          },
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_name", selector: { boolean: {} } },
              { name: "brushed", selector: { boolean: {} } },
            ],
          },
          transparencyBlurSchema(this._config?.transparency),
          { name: "name", selector: { text: {} } },
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              {
                name: "width",
                disabled: this.embedded || inGrid,
                selector: { number: { min: 80, max: 600, step: 10, mode: "box", unit_of_measurement: "px" } },
              },
              {
                name: "height",
                disabled: this.embedded || inGrid,
                selector: { number: { min: 60, max: 600, step: 10, mode: "box", unit_of_measurement: "px" } },
              },
            ],
          },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Interactions",
        iconPath: INTERACTIONS_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "tap_action",
            selector: { ui_action: { default_action: "more-info" } },
            context: ACTION_CONTEXT,
          },
          {
            name: "hold_action",
            selector: { ui_action: { default_action: "none" } },
            context: ACTION_CONTEXT,
          },
          {
            name: "",
            type: "optional_actions",
            flatten: true,
            schema: [
              {
                name: "double_tap_action",
                selector: { ui_action: { default_action: "none" } },
                context: ACTION_CONTEXT,
              },
            ],
          },
        ],
      },
    ];
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "width" || schema.name === "height") {
      return "Only used when the card isn't a direct item in a grid (Sections) view.";
    }
    if (schema.name === "aspect_ratio") {
      return "e.g. 16:9. Ignored in a grid (Sections) view with set rows.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "entity":
        return "Camera entity";
      case "name":
        return "Caption (optional)";
      case "show_name":
        return "Show caption";
      case "camera_view":
        return "Camera view";
      case "fit_mode":
        return "Fit mode";
      case "aspect_ratio":
        return "Aspect ratio (optional)";
      case "theme":
        return "Visual styling";
      case "brushed":
        return "Brushed effect";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "width":
        return "Width (px)";
      case "height":
        return "Height (px)";
      case "tap_action":
      case "hold_action":
      case "double_tap_action": {
        const label =
          this.hass?.localize(`ui.panel.lovelace.editor.card.generic.${schema.name}`) || "";
        const optional =
          this.hass?.localize("ui.panel.lovelace.editor.card.config.optional") || "optional";
        return label ? `${label} (${optional})` : schema.name;
      }
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as CameraCardConfig);
  };

  /** Strip values equal to their default and fire config-changed. */
  private _commit(raw: CameraCardConfig): void {
    const config = { ...raw } as CameraCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof CameraCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
    if (!config.name) delete config.name;
    if (!config.aspect_ratio) delete config.aspect_ratio;
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card-editor": TedCameraCardEditor;
  }
}
