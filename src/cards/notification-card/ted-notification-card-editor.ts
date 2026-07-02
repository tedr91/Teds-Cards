import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { NOTIFICATION_CARD_EDITOR_TYPE } from "./const";
import type { NotificationCardConfig } from "./types";

// mdi:palette
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:page-layout-header
const HEADER_ICON_PATH =
  "M21,5V19H3V5H21M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M5,7H19V9H5V7Z";
// mdi:cog
const BEHAVIOUR_ICON_PATH =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";

@customElement(NOTIFICATION_CARD_EDITOR_TYPE)
export class TedNotificationCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: NotificationCardConfig;

  public setConfig(config: NotificationCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<NotificationCardConfig> {
    return {
      theme: "ha",
      brushed: false,
      shadow: true,
      transparency: undefined,
      blur: undefined,
      background: undefined,
      scale: 100,
      show_header_icon: true,
      show_header_name: true,
      header_divider: false,
      show_toasts: true,
      mark_read_on_open: false,
      max_items: 50,
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
      { name: "area", selector: { area: {} } },
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
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Behaviour",
        iconPath: BEHAVIOUR_ICON_PATH,
        flatten: true,
        schema: [
          { name: "show_toasts", selector: { boolean: {} } },
          { name: "mark_read_on_open", selector: { boolean: {} } },
          {
            name: "max_items",
            selector: { number: { min: 1, max: 100, step: 1, mode: "box" } },
          },
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
      case "show_toasts":
        return "Pop toasts for new notifications";
      case "mark_read_on_open":
        return "Mark all read when shown";
      case "max_items":
        return "Maximum notifications shown";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...this._config, ...ev.detail.value } as NotificationCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof NotificationCardConfig>) {
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
    "ted-notification-card-editor": TedNotificationCardEditor;
  }
}
