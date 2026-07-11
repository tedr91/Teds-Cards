import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { SETTINGS_CARD_EDITOR_TYPE } from "./const";
import type { SettingsCardConfig } from "./types";

@customElement(SETTINGS_CARD_EDITOR_TYPE)
export class TedSettingsCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SettingsCardConfig;

  public setConfig(config: SettingsCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<SettingsCardConfig> {
    return {
      theme: "ha",
      shadow: true,
      brushed: false,
      show_global: true,
      show_device: true,
      tab_header: "both",
      auto_shrink: true,
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
        schema: [
          {
            name: "tab_header",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "both", label: "Icon + name (default)" },
                  { value: "icon", label: "Icon only" },
                  { value: "name", label: "Name only" },
                ],
              },
            },
          },
          { name: "auto_shrink", selector: { boolean: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_global", selector: { boolean: {} } },
          { name: "show_device", selector: { boolean: {} } },
        ],
      },
      {
        name: "theme",
        selector: {
          select: { mode: "dropdown", options: [
            { value: "ha", label: "Home Assistant" },
            { value: "ted-style", label: "Ted's style" },
          ] },
        },
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "shadow", selector: { boolean: {} } },
          { name: "brushed", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Title";
      case "tab_header":
        return "Tab header";
      case "auto_shrink":
        return "Auto shrink tab header (icons only when tabs don't fit)";
      case "show_global":
        return "Show Global tab";
      case "show_device":
        return "Show This device tab";
      case "theme":
        return "Theme";
      case "shadow":
        return "Card shadow";
      case "brushed":
        return "Brushed overlay";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    fireEvent(this, "config-changed", { config: ev.detail.value as SettingsCardConfig });
  };
}
