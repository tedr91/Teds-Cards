import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard } from "custom-card-helpers";

import { tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { TIMERS_SENSOR, TIMER_CARD_DESCRIPTION, TIMER_CARD_NAME, TIMER_CARD_TYPE, TIMER_DOMAIN } from "./const";

interface ActiveTimer {
  id: string;
  name: string;
  ends: string;
}
interface RecentTimer {
  name: string;
  h: number;
  m: number;
  s: number;
}

registerCustomCard({ type: TIMER_CARD_TYPE, name: TIMER_CARD_NAME, description: TIMER_CARD_DESCRIPTION });

@customElement(TIMER_CARD_TYPE)
export class TedTimerCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _name = "";
  @state() private _min = 5;

  public setConfig(_config: Record<string, unknown>): void {
    void _config;
  }
  public getCardSize(): number {
    return 3;
  }

  private _attr(k: string): unknown[] {
    return (this.hass?.states[TIMERS_SENSOR]?.attributes[k] as unknown[]) ?? [];
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    if (!this.hass.states[TIMERS_SENSOR])
      return html`<ha-card class="ted-card ted-card--theme-ha"><div class="warn">Install the Ted's Cards Backend integration to use timers.</div></ha-card>`;
    const active = this._attr("active") as ActiveTimer[];
    const recent = this._attr("recent") as RecentTimer[];
    return html`
      <ha-card class="ted-card ted-card--theme-ha">
        <div class="head">Timers</div>
        ${active.map(
          (t) => html`<div class="row"><span class="lbl">${t.name}</span>
            <ha-icon-button @click=${() => this.hass!.callService(TIMER_DOMAIN, "cancel_timer", { id: t.id })}><ha-icon icon="mdi:close"></ha-icon></ha-icon-button></div>`,
        )}
        <div class="row add">
          <input .value=${this._name} placeholder="Name" @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <input type="number" min="1" .value=${String(this._min)} @input=${(e: Event) => (this._min = +(e.target as HTMLInputElement).value)} /> min
          <ha-icon-button @click=${() => this.hass!.callService(TIMER_DOMAIN, "start_timer", { name: this._name || "Timer", minutes: this._min })}><ha-icon icon="mdi:play"></ha-icon></ha-icon-button>
        </div>
        ${recent.length ? html`<div class="recent">${recent.map((r) => html`<button @click=${() => this.hass!.callService(TIMER_DOMAIN, "start_timer", { name: r.name, hours: r.h, minutes: r.m, seconds: r.s })}>${r.name}</button>`)}</div>` : nothing}
      </ha-card>
    `;
  }

  static styles = [
    tedStyleTheme,
    css`
      .head { font-weight: 600; padding: 12px 14px 4px; }
      .row { display: flex; align-items: center; gap: 8px; padding: 6px 14px; }
      .lbl { flex: 1; }
      .warn { padding: 14px; color: var(--ted-style-muted); }
      .recent { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px; }
      .recent button { border: 1px solid var(--ted-style-divider); border-radius: 999px; padding: 4px 10px; background: transparent; color: var(--ted-style-text); cursor: pointer; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-timer-card": TedTimerCard;
  }
}
