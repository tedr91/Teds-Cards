import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor } from "custom-card-helpers";

import { BACKGROUND_CARD_EDITOR_TYPE } from "./const";
import type { BackgroundCardConfig } from "./types";

@customElement(BACKGROUND_CARD_EDITOR_TYPE)
export class TedBackgroundCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: BackgroundCardConfig;

  public setConfig(config: BackgroundCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    return html`
      <div class="info">
        <ha-icon icon="mdi:image-outline"></ha-icon>
        <div>
          <p><b>Invisible card</b> — it paints the dashboard background.</p>
          <p>
            Configure the wallpaper in
            <b>Settings → General → Background Wallpaper</b>. Place one of these cards
            on the dashboard (e.g. a shared layout) and it applies to every view.
          </p>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    .info {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px;
      border-radius: 10px;
      background: var(--secondary-background-color);
    }
    .info ha-icon {
      --mdc-icon-size: 28px;
      color: var(--primary-color);
      flex: none;
    }
    .info p {
      margin: 0 0 6px;
    }
    .info p:last-child {
      margin-bottom: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-background-card-editor": TedBackgroundCardEditor;
  }
}
