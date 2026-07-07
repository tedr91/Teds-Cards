import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { ALARM_CARD_EDITOR_TYPE } from "./const";
import type { AlarmCardConfig } from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:page-layout-header — Header section
const HEADER_ICON_PATH =
  "M21,5V19H3V5H21M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M5,7H19V9H5V7Z";

@customElement(ALARM_CARD_EDITOR_TYPE)
export class TedAlarmCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AlarmCardConfig;

  public setConfig(config: AlarmCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<AlarmCardConfig> {
    return {
      theme: "ha",
      brushed: false,
      shadow: true,
      show_add: true,
      show_area_in_title: true,
      transparency: undefined,
      blur: undefined,
      background: undefined,
      scale: 100,
      show_header_icon: true,
      show_header_name: true,
      header_divider: false,
    };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _schema() {
    return [
      { name: "title", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "area", selector: { area: {} } },
          { name: "show_area_in_title", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
        iconPath: APPEARANCE_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "theme",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "ted-style", label: "Ted's Style" },
                  { value: "ha", label: "Home Assistant theme (default)" },
                ],
              },
            },
          },
          { name: "background", selector: { ui_color: {} } },
          { name: "brushed", selector: { boolean: {} } },
          { name: "shadow", selector: { boolean: {} } },
          transparencyBlurSchema(this._config?.transparency),
          {
            name: "scale",
            selector: { number: { min: 50, max: 200, step: 5, mode: "box", unit_of_measurement: "%" } },
          },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Header",
        iconPath: HEADER_ICON_PATH,
        flatten: true,
        schema: [
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_header_icon", selector: { boolean: {} } },
              {
                name: "header_icon_size",
                disabled: this._config?.show_header_icon === false,
                selector: { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } },
              },
            ],
          },
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_header_name", selector: { boolean: {} } },
              {
                name: "header_name_size",
                disabled: this._config?.show_header_name === false,
                selector: { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } },
              },
            ],
          },
          { name: "header_divider", selector: { boolean: {} } },
          { name: "show_add", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Title";
      case "area":
        return "Area (optional — scopes this card to a room)";
      case "show_area_in_title":
        return "Display area in title";
      case "show_add":
        return "Show add button";
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "brushed":
        return "Brushed effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
      case "scale":
        return "Card scale";
      case "show_header_icon":
        return "Display icon in header";
      case "header_icon_size":
        return "Icon size override";
      case "show_header_name":
        return "Display name in header";
      case "header_name_size":
        return "Name size override";
      case "header_divider":
        return "Display header divider line";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...this._config, ...ev.detail.value } as AlarmCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof AlarmCardConfig>) {
      if (config[key] === defaults[key]) delete config[key];
    }
    if (!config.title) delete config.title;
    if (!config.area) delete config.area;
    fireEvent(this, "config-changed", { config });
  };

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-alarm-card-editor": TedAlarmCardEditor;
  }
}
