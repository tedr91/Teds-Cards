import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { LIGHT_CARD_EDITOR_TYPE } from "./const";
import type { LightCardConfig } from "./types";

const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";

@customElement(LIGHT_CARD_EDITOR_TYPE)
export class TedLightCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: LightCardConfig;

  public setConfig(config: LightCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    // Apply defaults so the dropdowns show the current selection.
    const data = { theme: "ted-style", brightness_color: "theme", ...this._config };

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
    const visual: Array<Record<string, unknown>> = [
      {
        name: "theme",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "ted-style", label: "Ted's Home Theater (default)" },
              { value: "ha", label: "Home Assistant theme" },
            ],
          },
        },
      },
      {
        name: "brightness_color",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "theme", label: "Theme color (default)" },
              { value: "light", label: "Light color" },
              { value: "other", label: "Custom color" },
            ],
          },
        },
      },
    ];
    if (this._config?.brightness_color === "other") {
      visual.push({ name: "brightness_color_custom", selector: { color_rgb: {} } });
    }
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "light" } },
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Visual",
        iconPath: VISUAL_ICON_PATH,
        flatten: true,
        schema: visual,
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "entity":
        return "Entity";
      case "name":
        return "Name (optional)";
      case "icon":
        return "Icon (optional)";
      case "theme":
        return "Visual styling";
      case "brightness_color":
        return "Brightness slider color";
      case "brightness_color_custom":
        return "Custom color";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...ev.detail.value } as LightCardConfig;
    // Strip defaults so the saved YAML stays minimal.
    if (config.theme === "ted-style") {
      delete config.theme;
    }
    if (config.brightness_color === "theme") {
      delete config.brightness_color;
    }
    if (config.brightness_color !== "other") {
      delete config.brightness_color_custom;
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
    "ted-light-card-editor": TedLightCardEditor;
  }
}
