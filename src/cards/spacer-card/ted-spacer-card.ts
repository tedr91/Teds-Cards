import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { DEFAULT_SPACER_SIZE, SPACER_CARD_EDITOR_TYPE, SPACER_CARD_TYPE } from "./const";
import type { SpacerCardConfig } from "./types";

/**
 * A totally transparent, non-interactive card with a fixed size. Useful as an
 * empty placeholder inside a Room Card button section (it reserves a grid cell)
 * or anywhere a fixed gap is needed.
 */
@customElement(SPACER_CARD_TYPE)
export class TedSpacerCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-spacer-card-editor");
    return document.createElement(SPACER_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<SpacerCardConfig, "type"> {
    return { size: DEFAULT_SPACER_SIZE };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: SpacerCardConfig;

  public setConfig(config: SpacerCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 1;
  }

  protected render(): TemplateResult | typeof nothing {
    const size = typeof this._config?.size === "number" ? this._config.size : DEFAULT_SPACER_SIZE;
    // As a direct grid item (e.g. a Room Card button cell) the spacer fills the
    // cell so it matches a button; everywhere else it uses its fixed size.
    const style =
      this.layout === "grid" ? {} : { width: `${size}px`, height: `${size}px` };
    return html`<div class="spacer" style=${styleMap(style)}></div>`;
  }

  static styles = css`
    :host {
      display: block;
      pointer-events: none;
    }
    .spacer {
      background: transparent;
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-spacer-card": TedSpacerCard;
  }
}
