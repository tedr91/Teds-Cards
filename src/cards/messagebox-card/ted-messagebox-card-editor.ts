import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { DEFAULT_DISPLAY, DEFAULT_SEVERITY, MESSAGEBOX_CARD_EDITOR_TYPE } from "./const";
import type { MessageBoxCardConfig } from "./types";

const SEVERITIES = ["info", "success", "warning", "danger", "tip"];
const DISPLAYS = ["inline", "pinned", "modal"];

@customElement(MESSAGEBOX_CARD_EDITOR_TYPE)
export class TedMessageBoxCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: MessageBoxCardConfig;

  public setConfig(config: MessageBoxCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const data = {
      title: cfg.title ?? "",
      message: cfg.message ?? "",
      icon: cfg.icon ?? "",
      severity: cfg.severity ?? DEFAULT_SEVERITY,
      display: cfg.display ?? DEFAULT_DISPLAY,
      pinned_side: cfg.pinned_side ?? "top",
      dismiss_key: cfg.dismiss_key ?? "",
      docs_url: cfg.docs_url ?? "",
      theme: cfg.theme ?? "ha",
      shadow: cfg.shadow ?? true,
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <p class="note">
        <code>actions</code> and <code>show_if</code> are configured in YAML — see the card
        documentation.
      </p>
    `;
  }

  private _schema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "message", selector: { text: { multiline: true } } },
      { name: "icon", selector: { icon: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          {
            name: "severity",
            selector: {
              select: {
                mode: "dropdown",
                options: SEVERITIES.map((v) => ({ value: v, label: v })),
              },
            },
          },
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
          {
            name: "display",
            selector: {
              select: { mode: "dropdown", options: DISPLAYS.map((v) => ({ value: v, label: v })) },
            },
          },
          {
            name: "pinned_side",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "top", label: "top" },
                  { value: "center", label: "center" },
                  { value: "bottom", label: "bottom" },
                ],
              },
            },
          },
        ],
      },
      { name: "dismiss_key", selector: { text: {} } },
      { name: "docs_url", selector: { text: {} } },
      { name: "shadow", selector: { boolean: {} } },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Title";
      case "message":
        return "Message";
      case "icon":
        return "Icon";
      case "severity":
        return "Severity";
      case "theme":
        return "Visual styling";
      case "display":
        return "Display";
      case "pinned_side":
        return "Pinned side";
      case "dismiss_key":
        return "Dismiss key (for never / not-now)";
      case "docs_url":
        return "Learn-more URL";
      case "shadow":
        return "Subtle shadow";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const merged = { ...this._config, ...ev.detail.value } as MessageBoxCardConfig;
    for (const key of ["title", "message", "icon", "dismiss_key", "docs_url"] as const) {
      if (merged[key] === "") delete merged[key];
    }
    fireEvent(this, "config-changed", { config: merged });
  };

  static styles = css`
    :host {
      display: block;
    }
    .note {
      margin: 12px 4px 0;
      font-size: 0.85em;
      opacity: 0.7;
    }
    .note code {
      background: rgba(127, 127, 127, 0.18);
      padding: 1px 5px;
      border-radius: 4px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-messagebox-card-editor": TedMessageBoxCardEditor;
  }
}
