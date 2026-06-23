import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { DEFAULT_SPACER_SIZE, SPACER_CARD_EDITOR_TYPE } from "./const";
import type { SpacerCardConfig } from "./types";

@customElement(SPACER_CARD_EDITOR_TYPE)
export class TedSpacerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Set when embedded as a Room Card button (kept for parity with sibling editors). */
  @property({ attribute: false }) public embedded = false;
  @state() private _config?: SpacerCardConfig;

  public setConfig(config: SpacerCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { size: this._config.size ?? DEFAULT_SPACER_SIZE };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${[
          {
            name: "size",
            selector: { number: { min: 0, max: 600, step: 1, mode: "box", unit_of_measurement: "px" } },
          },
        ]}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (schema: { name: string }): string =>
    schema.name === "size" ? "Size (px)" : schema.name;

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...this._config, ...ev.detail.value } as SpacerCardConfig;
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
    "ted-spacer-card-editor": TedSpacerCardEditor;
  }
}
