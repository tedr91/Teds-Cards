import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  type LovelaceConfig,
  fireEvent,
} from "custom-card-helpers";

import { FULLSCREEN_CARD_EDITOR_TYPE } from "./const";
import type { FullscreenCardConfig } from "./types";

type AnyHtmlElement = HTMLElement & Record<string, unknown>;

@customElement(FULLSCREEN_CARD_EDITOR_TYPE)
export class TedFullscreenCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Passed down by HA's card editor host; forwarded to the embedded native editor. */
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() private _config?: FullscreenCardConfig;

  /** The native `hui-card-element-editor` for the housed card. */
  private _cardEditor?: AnyHtmlElement;
  /** Last card JSON pushed to / received from the editor, to avoid mid-edit reverts. */
  private _editorJson?: string;
  /** True once the native `hui-card-picker` element is registered. */
  private _pickerReady = typeof customElements !== "undefined" && !!customElements.get("hui-card-picker");

  public setConfig(config: FullscreenCardConfig): void {
    this._config = { ...config };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this._pickerReady && typeof customElements !== "undefined") {
      customElements.whenDefined("hui-card-picker").then(() => {
        this._pickerReady = true;
        this.requestUpdate();
      });
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass") || changed.has("lovelace")) {
      this._syncCardEditor();
    }
  }

  /** Ensure the native card editor exists + is current when a card is configured. */
  private _syncCardEditor(): void {
    const card = this._config?.card;
    if (!card) {
      this._cardEditor = undefined;
      this._editorJson = undefined;
      return;
    }
    const json = JSON.stringify(card);
    if (!this._cardEditor) {
      const el = document.createElement("hui-card-element-editor") as AnyHtmlElement;
      el.addEventListener("config-changed", (ev) => this._onCardChanged(ev as CustomEvent));
      el.hass = this.hass;
      el.lovelace = this.lovelace;
      el.value = card;
      this._cardEditor = el;
      this._editorJson = json;
      return;
    }
    this._cardEditor.hass = this.hass;
    this._cardEditor.lovelace = this.lovelace;
    // Only push EXTERNAL changes (not our own echoes) so typing isn't reverted.
    if (this._editorJson !== json) {
      this._cardEditor.value = card;
      this._editorJson = json;
    }
  }

  private _onCardChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const card = ev.detail?.config as LovelaceCardConfig | undefined;
    if (!card) return;
    this._editorJson = JSON.stringify(card);
    this._commit({ ...this._config!, card });
  }

  private _onCardPicked(ev: CustomEvent): void {
    ev.stopPropagation();
    const card = ev.detail?.config as LovelaceCardConfig | undefined;
    if (!card) return;
    this._commit({ ...this._config!, card });
  }

  private _onManualType(ev: CustomEvent): void {
    ev.stopPropagation();
    const type = (ev.detail.value?.card_type as string | undefined)?.trim();
    if (!type) return;
    this._commit({ ...this._config!, card: { type } as LovelaceCardConfig });
  }

  private _onOptionsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as Partial<FullscreenCardConfig>;
    const config: FullscreenCardConfig = { ...this._config!, ...value };
    if (config.theme === "ha" || !config.theme) delete config.theme;
    if (config.start_maximized !== true) delete config.start_maximized;
    if (config.fill !== true) delete config.fill;
    for (const key of ["expand_icon", "minimize_icon", "empty_title", "empty_message"] as const) {
      const v = config[key];
      if (v === undefined || v === null || v === "") delete config[key];
    }
    this._commit(config);
  };

  private _commit(next: FullscreenCardConfig): void {
    this._config = next;
    fireEvent(this, "config-changed", { config: next });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const optionsData = {
      theme: cfg.theme ?? "ha",
      start_maximized: cfg.start_maximized === true,
      fill: cfg.fill === true,
      expand_icon: cfg.expand_icon ?? "",
      minimize_icon: cfg.minimize_icon ?? "",
      empty_title: cfg.empty_title ?? "",
      empty_message: cfg.empty_message ?? "",
    };
    return html`
      <div class="hint">
        This card houses a single card and adds a corner icon to toggle it full-screen. Pick the card
        to house below.
      </div>
      ${this._renderCard(cfg)}

      <ha-expansion-panel outlined class="options">
        <span slot="header">Full-screen options</span>
        <ha-form
          .hass=${this.hass}
          .data=${optionsData}
          .schema=${this._optionsSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._onOptionsChanged}
        ></ha-form>
      </ha-expansion-panel>
    `;
  }

  private _renderCard(cfg: FullscreenCardConfig): TemplateResult {
    if (cfg.card) {
      return html`${this._cardEditor ?? html`<div class="hint">Loading editor…</div>`}`;
    }
    if (this._pickerReady) {
      return html`<hui-card-picker
        .hass=${this.hass}
        .lovelace=${this.lovelace}
        @config-changed=${(ev: CustomEvent) => this._onCardPicked(ev)}
      ></hui-card-picker>`;
    }
    // Fallback until the native picker is available: type a card type to start.
    return html`
      <div class="hint">Enter a card type to add (e.g. <code>custom:ted-music-card</code>):</div>
      <ha-form
        .hass=${this.hass}
        .data=${{ card_type: "" }}
        .schema=${[{ name: "card_type", selector: { text: {} } }]}
        .computeLabel=${() => "Card type"}
        @value-changed=${(ev: CustomEvent) => this._onManualType(ev)}
      ></ha-form>
    `;
  }

  private _optionsSchema() {
    return [
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
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
          { name: "start_maximized", selector: { boolean: {} } },
          { name: "fill", selector: { boolean: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "expand_icon", selector: { icon: {} } },
          { name: "minimize_icon", selector: { icon: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "empty_title", selector: { text: {} } },
          { name: "empty_message", selector: { text: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "theme":
        return "Visual styling";
      case "start_maximized":
        return "Start maximized";
      case "fill":
        return "Fill the card space";
      case "expand_icon":
        return "Expand icon";
      case "minimize_icon":
        return "Minimize icon";
      case "empty_title":
        return "Empty title";
      case "empty_message":
        return "Empty message";
      default:
        return schema.name;
    }
  };

  static styles = css`
    :host {
      display: block;
    }
    .options {
      margin-top: 16px;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin-bottom: 8px;
    }
    code {
      background: var(--secondary-background-color);
      padding: 1px 4px;
      border-radius: 4px;
    }
  `;
}
