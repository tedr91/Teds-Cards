import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { ROOM_CARD_EDITOR_TYPE } from "./const";
import type { RoomCardConfig } from "./types";

// mdi:texture-box — Area Setup section
const AREA_ICON_PATH =
  "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,11H6V13H4V11M4,15H10V17H4V15M20,17H12V15H20V17M20,13H8V11H20V13M20,9H4V6H20V9Z";

// mdi:palette — Appearance (General) section
const APPEARANCE_ICON_PATH =
  "M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M7,11A1,1 0 0,0 6,12A1,1 0 0,0 7,13A1,1 0 0,0 8,12A1,1 0 0,0 7,11M10,7A1,1 0 0,0 9,8A1,1 0 0,0 10,9A1,1 0 0,0 11,8A1,1 0 0,0 10,7M14,7A1,1 0 0,0 13,8A1,1 0 0,0 14,9A1,1 0 0,0 15,8A1,1 0 0,0 14,7M17,11A1,1 0 0,0 16,12A1,1 0 0,0 17,13A1,1 0 0,0 18,12A1,1 0 0,0 17,11Z";

@customElement(ROOM_CARD_EDITOR_TYPE)
export class TedRoomCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: RoomCardConfig;

  public setConfig(config: RoomCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    // Apply defaults so the dropdowns show the current selection.
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

  private _defaults(): Partial<RoomCardConfig> {
    return {
      theme: "ted-style",
      brushed: false,
    };
  }

  private _schema() {
    return [
      {
        name: "",
        type: "expandable",
        title: "Area Setup",
        iconPath: AREA_ICON_PATH,
        expanded: true,
        flatten: true,
        schema: [
          { name: "area", required: true, selector: { area: {} } },
          { name: "name", selector: { text: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Appearance (General)",
        iconPath: APPEARANCE_ICON_PATH,
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
          { name: "brushed", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "area":
        return "Area";
      case "name":
        return "Title (optional)";
      case "theme":
        return "Visual styling";
      case "brushed":
        return "Brushed effect";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...ev.detail.value } as RoomCardConfig;
    const defaults = this._defaults();
    // Strip values equal to their default so the saved YAML stays minimal.
    for (const key of Object.keys(defaults) as Array<keyof RoomCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
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
    "ted-room-card-editor": TedRoomCardEditor;
  }
}
