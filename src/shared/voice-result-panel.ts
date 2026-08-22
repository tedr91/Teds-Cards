import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";

import type { VoiceEntityCardResult, VoiceRichResult, VoiceWeatherResult } from "./voice-results";

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

@customElement("ted-voice-result-panel")
export class TedVoiceResultPanel extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public results: VoiceRichResult[] = [];
  @property({ type: Boolean }) public compact = false;

  private _helpers?: CardHelpers;
  private _card?: LovelaceCard;
  private _cardJson?: string;

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.results.length) return nothing;
    return html`<div
      class="results ${this.compact ? "compact" : ""}"
      @pointerdown=${this._activity}
      @touchstart=${this._activity}
      @wheel=${this._activity}
      @keydown=${this._activity}
    >
      ${this.results.map((result) =>
        result.kind === "weather" ? this._renderWeather(result) : this._renderEntityCard(result),
      )}
    </div>`;
  }

  private _activity(): void {
    window.dispatchEvent(new CustomEvent("ted-voice-result-activity"));
  }

  private _renderWeather(result: VoiceWeatherResult): TemplateResult {
    return html`<section class="result weather">
      <div class="result-head">
        ${result.conditionIcon ? html`<ha-icon .icon=${result.conditionIcon}></ha-icon>` : nothing}
        <strong>Weather</strong>
        ${result.currentTemperature !== undefined
          ? html`<span>${result.currentTemperature}°</span>`
          : nothing}
        ${result.currentHumidity !== undefined
          ? html`<span>${result.currentHumidity}% humidity</span>`
          : nothing}
      </div>
      ${result.forecast.length
        ? html`<div class="forecast">
            ${result.forecast.map((item) => html`<div class="forecast-item">
              <span>${this._forecastDate(item)}</span>
              <strong>${this._condition(item.condition)}</strong>
              <span>${this._temperature(item)}</span>
            </div>`)}
          </div>`
        : nothing}
    </section>`;
  }

  private _renderEntityCard(result: VoiceEntityCardResult): TemplateResult {
    if (!this._helpers) return html`<section class="result loading">Loading preview…</section>`;
    const json = JSON.stringify(result.card);
    if (!this._card || this._cardJson !== json) {
      this._card = this._helpers.createCardElement(result.card);
      this._cardJson = json;
    }
    if (this.hass) this._card.hass = this.hass;
    return html`<section class="result entity" inert aria-label="Read-only entity preview">
      ${this._card}
    </section>`;
  }

  private _forecastDate(item: Record<string, unknown>): string {
    const raw = item.datetime ?? item.date;
    if (typeof raw !== "string") return "Forecast";
    const date = new Date(raw);
    return Number.isNaN(date.valueOf())
      ? raw
      : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  private _condition(value: unknown): string {
    return typeof value === "string" ? value.replace(/-/g, " ") : "";
  }

  private _temperature(item: Record<string, unknown>): string {
    const high = item.temperature;
    const low = item.templow;
    if (typeof high !== "number" && typeof high !== "string") return "";
    return low === undefined ? `${high}°` : `${low}–${high}°`;
  }

  private async _loadHelpers(): Promise<void> {
    const loader = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> })
      .loadCardHelpers;
    if (!loader || this._helpers) return;
    this._helpers = await loader();
    this.requestUpdate();
  }

  static styles = css`
    :host { display: block; min-width: 0; }
    .results { display: grid; gap: 12px; }
    .result {
      box-sizing: border-box;
      min-width: 0;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.18);
    }
    .result-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .result-head ha-icon { --mdc-icon-size: 24px; }
    .forecast {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .forecast-item {
      display: grid;
      gap: 3px;
      padding: 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      text-transform: capitalize;
    }
    .forecast-item span { font-size: 0.82em; opacity: 0.78; }
    .entity { pointer-events: none; }
    .compact .forecast { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
    .loading { color: var(--secondary-text-color); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-voice-result-panel": TedVoiceResultPanel;
  }
}