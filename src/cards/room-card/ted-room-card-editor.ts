import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { ROOM_CARD_EDITOR_TYPE } from "./const";
import type { RoomCardConfig } from "./types";

// mdi:texture-box — Area Setup section
const AREA_ICON_PATH =
  "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,11H6V13H4V11M4,15H10V17H4V15M20,17H12V15H20V17M20,13H8V11H20V13M20,9H4V6H20V9Z";

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
