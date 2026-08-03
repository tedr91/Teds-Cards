import { LitElement, css, html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard } from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import {
  WEBVIEW_CARD_DESCRIPTION,
  WEBVIEW_CARD_NAME,
  WEBVIEW_CARD_TYPE,
} from "./const";
import type { WebviewCardConfig } from "./types";

const DEFAULT_ALLOW = "autoplay; fullscreen; microphone; encrypted-media; clipboard-write";

@customElement(WEBVIEW_CARD_TYPE)
export class TedWebviewCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: WebviewCardConfig;
  /** Bumped on navigation so the card re-reads the `?url=` query string. */
  @state() private _nav = 0;

  private _onLocationChanged = (): void => {
    this._nav++;
  };

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._onLocationChanged);
    window.addEventListener("popstate", this._onLocationChanged);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
  }

  public setConfig(config: WebviewCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 12;
  }

  public getGridOptions(): { columns: number | "full"; rows: number | "auto" } {
    return { columns: "full", rows: this._config?.fill === false ? 8 : "auto" };
  }

  /** Config `url` wins; otherwise read the `?<url_param>=` query string. */
  private _url(): string | undefined {
    if (this._config?.url) return this._config.url;
    const param = this._config?.url_param || "url";
    void this._nav; // re-read on navigation
    const value = new URLSearchParams(window.location.search).get(param);
    return value ?? undefined;
  }

  protected render(): TemplateResult {
    const url = this._url();
    if (!url) {
      return html`<div class="empty">No web page to display.</div>`;
    }
    return html`<iframe
      class="frame ${this._config?.fill === false ? "" : "fill"}"
      src=${url}
      allow=${this._config?.allow || DEFAULT_ALLOW}
      referrerpolicy="no-referrer"
    ></iframe>`;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .frame {
      width: 100%;
      border: 0;
      background: #000;
      display: block;
    }
    .frame.fill {
      height: 100%;
    }
    .frame:not(.fill) {
      height: 60vh;
    }
    .empty {
      height: 100%;
      min-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      color: var(--ted-style-text, var(--primary-text-color));
    }
  `;
}

registerCustomCard({
  type: WEBVIEW_CARD_TYPE,
  name: WEBVIEW_CARD_NAME,
  description: WEBVIEW_CARD_DESCRIPTION,
});
