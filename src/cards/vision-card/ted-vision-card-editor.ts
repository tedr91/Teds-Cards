import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { VISION_CARD_EDITOR_TYPE } from "./const";
import type { VisionCardConfig } from "./types";

const THEME_OPTIONS = [
  { value: "ted-style", label: "Ted style" },
  { value: "ha", label: "Home Assistant" },
];

const LAYOUT_OPTIONS = [
  { value: "list", label: "List" },
  { value: "tiles", label: "Tiles" },
];

@customElement(VISION_CARD_EDITOR_TYPE)
export class TedVisionCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: VisionCardConfig;

  public setConfig(config: VisionCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = {
      title: this._config.title ?? "",
      theme: this._config.theme ?? "ha",
      layout: this._config.layout ?? "list",
      max_events: this._config.max_events ?? 50,
      cameras: this._config.cameras ?? [],
    };
    const schema = [
      { name: "title", selector: { text: { placeholder: "Vision Events" } } },
      { name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } },
      { name: "layout", selector: { select: { mode: "dropdown", options: LAYOUT_OPTIONS } } },
      { name: "max_events", selector: { number: { min: 1, max: 500, mode: "box" } } },
      {
        name: "cameras",
        selector: { entity: { domain: "camera", multiple: true } },
      },
    ];
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (s: { name: string }): string =>
    ({
      title: "Title",
      theme: "Theme",
      layout: "Layout",
      max_events: "Max events shown",
      cameras: "Filter to cameras (optional)",
    })[s.name] ?? s.name;

  private _computeHelper = (s: { name: string }): string =>
    s.name === "cameras" ? "Leave empty to show events from every camera." : "";

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const next = { ...this._config, ...(ev.detail.value as Partial<VisionCardConfig>) };
    if (!next.title) delete next.title;
    if (Array.isArray(next.cameras) && next.cameras.length === 0) delete next.cameras;
    fireEvent(this, "config-changed", { config: next });
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}
