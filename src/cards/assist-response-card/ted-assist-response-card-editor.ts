import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { appearanceLabel, transparencyBlurSchema } from "../../shared/appearance";
import { ASSIST_RESPONSE_CARD_EDITOR_TYPE } from "./const";
import type { AssistResponseCardConfig } from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";

@customElement(ASSIST_RESPONSE_CARD_EDITOR_TYPE)
export class TedAssistResponseCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AssistResponseCardConfig;

  public setConfig(config: AssistResponseCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<AssistResponseCardConfig> {
    return { theme: "ted-style", fill: true, transparency: undefined, blur: undefined, background: undefined };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema(data)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _schema(data: Partial<AssistResponseCardConfig>) {
    return [
      { name: "title", selector: { text: { placeholder: "Assist" } } },
      { name: "placeholder", selector: { text: { placeholder: "Waiting for a response…" } } },
      { name: "background_image", selector: { text: {} } },
      { name: "fill", selector: { boolean: {} } },
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
                  { value: "ted-style", label: "Ted's Style (default)" },
                  { value: "ha", label: "Home Assistant theme" },
                ],
              },
            },
          },
          { name: "background", selector: { ui_color: {} } },
          transparencyBlurSchema(data.transparency),
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Fallback title";
      case "placeholder":
        return "Placeholder message";
      case "background_image":
        return "Default background image (URL)";
      case "fill":
        return "Fill the content area";
      case "theme":
        return "Theme";
      case "background":
        return "Background color";
      default:
        return appearanceLabel(schema.name) ?? schema.name;
    }
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const config = { ...(ev.detail.value as AssistResponseCardConfig) };
    const defaults = this._defaults();
    // Strip values that equal the defaults to keep the YAML tidy.
    if (config.theme === defaults.theme) delete config.theme;
    if (config.fill === defaults.fill) delete config.fill;
    if (config.transparency === undefined) delete config.transparency;
    if (config.blur === undefined) delete config.blur;
    if (!config.background) delete config.background;
    if (!config.title) delete config.title;
    if (!config.placeholder) delete config.placeholder;
    if (!config.background_image) delete config.background_image;
    fireEvent(this, "config-changed", { config });
  }
}
