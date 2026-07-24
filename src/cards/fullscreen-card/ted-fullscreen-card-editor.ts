import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  type LovelaceConfig,
  fireEvent,
} from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { FULLSCREEN_CARD_EDITOR_TYPE } from "./const";
import type { FullscreenCardConfig } from "./types";

type AnyHtmlElement = HTMLElement & Record<string, unknown>;

@customElement(FULLSCREEN_CARD_EDITOR_TYPE)
export class TedFullscreenCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Passed down by HA's card editor host; forwarded to the embedded native editor. */
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() private _config?: FullscreenCardConfig;
  /** Buffered text for the type-in fallback (committed only on "Add"). */
  @state() private _typedType = "";

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
    void this._ensurePicker();
  }

  /**
   * The native `hui-card-picker` is a lazy-loaded HA element that isn't registered
   * until something (e.g. the "Add card" dialog) has pulled its chunk in. Nudge HA to
   * load the card-editor infrastructure, then re-check so the picker can render inline
   * instead of the plain type-in fallback.
   */
  private async _ensurePicker(): Promise<void> {
    if (this._pickerReady || typeof customElements === "undefined") return;
    try {
      const loader = (window as unknown as {
        loadCardHelpers?: () => Promise<{ createCardElement?: (c: Record<string, unknown>) => HTMLElement }>;
      }).loadCardHelpers;
      const helpers = await loader?.();
      // A stack card's editor (`hui-stack-card-editor`) is what imports `hui-card-picker`,
      // so loading it registers the picker for our inline use.
      const el = helpers?.createCardElement?.({ type: "vertical-stack", cards: [] });
      const ctor = el?.constructor as { getConfigElement?: () => Promise<unknown> } | undefined;
      await ctor?.getConfigElement?.();
    } catch {
      /* best-effort */
    }
    try {
      await customElements.whenDefined("hui-card-picker");
      this._pickerReady = true;
      this.requestUpdate();
    } catch {
      /* stays on the type-in fallback */
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
    this._typedType = (ev.detail.value?.card_type as string | undefined) ?? "";
  }

  private _addManual = (): void => {
    const type = this._typedType.trim();
    if (!type) return;
    this._typedType = "";
    this._commit({ ...this._config!, card: { type } as LovelaceCardConfig });
  };

  /** Drop the housed card so the picker reappears (swap to a different card). */
  private _changeCard = (): void => {
    const next = { ...this._config! };
    delete next.card;
    this._cardEditor = undefined;
    this._editorJson = undefined;
    this._commit(next);
  };

  private _onOptionsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as Partial<FullscreenCardConfig>;
    const config: FullscreenCardConfig = { ...this._config!, ...value };
    if (config.theme === "ha" || !config.theme) delete config.theme;
    if (config.brushed !== true) delete config.brushed;
    if (config.shadow !== false) delete config.shadow;
    if (config.scale === 100 || config.scale == null) delete config.scale;
    if (config.show_toggle !== false) delete config.show_toggle;
    if (config.start_maximized !== true) delete config.start_maximized;
    if (config.fill !== true) delete config.fill;
    for (const key of ["transparency", "blur"] as const) {
      const v = config[key];
      if (v === undefined || v === null) delete config[key];
    }
    for (const key of ["background", "expand_icon", "minimize_icon", "empty_title", "empty_message"] as const) {
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
      background: cfg.background,
      brushed: cfg.brushed ?? false,
      shadow: cfg.shadow !== false,
      transparency: cfg.transparency,
      blur: cfg.blur,
      scale: cfg.scale ?? 100,
      show_toggle: cfg.show_toggle !== false,
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
      ${this._renderCardHeader(cfg)}

      <ha-expansion-panel outlined class="options">
        <span slot="header">Appearance (general)</span>
        <ha-form
          .hass=${this.hass}
          .data=${optionsData}
          .schema=${this._appearanceSchema(cfg)}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._onOptionsChanged}
        ></ha-form>
      </ha-expansion-panel>

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

      ${cfg.card
        ? html`<div class="child-editor">
            ${this._cardEditor ?? html`<div class="hint">Loading editor…</div>`}
          </div>`
        : nothing}
    `;
  }

  /** The housed-card row: a toolbar when a card is set, otherwise the picker / type-in. */
  private _renderCardHeader(cfg: FullscreenCardConfig): TemplateResult {
    if (cfg.card) {
      return html`
        <div class="card-toolbar">
          <span class="card-type">Housed card: <code>${cfg.card.type}</code></span>
          <button type="button" class="change-btn" @click=${this._changeCard}>
            <ha-icon .icon=${"mdi:swap-horizontal"}></ha-icon>
            Change card
          </button>
        </div>
      `;
    }
    if (this._pickerReady) {
      return html`<hui-card-picker
        .hass=${this.hass}
        .lovelace=${this.lovelace}
        @config-changed=${(ev: CustomEvent) => this._onCardPicked(ev)}
      ></hui-card-picker>`;
    }
    // Fallback until the native picker is available: type a card type, then click Add.
    return html`
      <div class="hint">Enter a card type (e.g. <code>custom:ted-music-card</code>), then click Add:</div>
      <div class="manual-row">
        <ha-form
          class="manual-form"
          .hass=${this.hass}
          .data=${{ card_type: this._typedType }}
          .schema=${[{ name: "card_type", selector: { text: {} } }]}
          .computeLabel=${() => "Card type"}
          @value-changed=${(ev: CustomEvent) => this._onManualType(ev)}
        ></ha-form>
        <button
          type="button"
          class="change-btn"
          ?disabled=${!this._typedType.trim()}
          @click=${this._addManual}
        >
          <ha-icon .icon=${"mdi:plus"}></ha-icon>
          Add
        </button>
      </div>
    `;
  }

  private _appearanceSchema(cfg: FullscreenCardConfig) {
    return [
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
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "brushed", selector: { boolean: {} } },
          { name: "shadow", selector: { boolean: {} } },
        ],
      },
      transparencyBlurSchema(cfg.transparency),
      {
        name: "scale",
        selector: { number: { min: 50, max: 200, step: 5, mode: "box", unit_of_measurement: "%" } },
      },
    ];
  }

  private _optionsSchema() {
    return [
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "show_toggle", selector: { boolean: {} } },
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
      case "background":
        return "Background color";
      case "brushed":
        return "Brushed effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "scale":
        return "Card scale";
      case "show_toggle":
        return "Show expand/collapse button";
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
    .child-editor {
      margin-top: 16px;
    }
    .card-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .card-type {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .change-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      padding: 4px 10px;
      border: 1px solid var(--divider-color);
      border-radius: 16px;
      background: transparent;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 0.9em;
    }
    .change-btn:hover {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .change-btn[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    .change-btn ha-icon {
      --mdc-icon-size: 16px;
      width: 16px;
      height: 16px;
    }
    .manual-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .manual-form {
      flex: 1;
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
