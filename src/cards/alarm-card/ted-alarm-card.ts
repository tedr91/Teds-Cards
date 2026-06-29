import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard } from "custom-card-helpers";

import { tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { ALARMS_SENSOR, ALARM_CARD_DESCRIPTION, ALARM_CARD_NAME, ALARM_CARD_TYPE, ALARM_DOMAIN } from "./const";

interface Alarm {
  id: string;
  label: string;
  time: string;
  days: number[];
  description?: string;
  enabled: boolean;
}

registerCustomCard({ type: ALARM_CARD_TYPE, name: ALARM_CARD_NAME, description: ALARM_CARD_DESCRIPTION });

@customElement(ALARM_CARD_TYPE)
export class TedAlarmCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _label = "";
  @state() private _time = "07:00";

  public setConfig(_config: Record<string, unknown>): void {
    void _config;
  }
  public getCardSize(): number {
    return 3;
  }

  private get _alarms(): Alarm[] {
    return (this.hass?.states[ALARMS_SENSOR]?.attributes.alarms as Alarm[]) ?? [];
  }

  private _add(): void {
    if (!this._label) return;
    this.hass?.callService(ALARM_DOMAIN, "add_alarm", { label: this._label, time: this._time });
    this._label = "";
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    const missing = !this.hass.states[ALARMS_SENSOR];
    return html`
      <ha-card class="ted-card ted-card--theme-ha">
        <div class="head">Alarms</div>
        ${missing
          ? html`<div class="warn">Install the Ted's Cards Backend integration to use alarms.</div>`
          : html`
              ${this._alarms.map(
                (a) => html`<div class="row">
                  <ha-switch .checked=${a.enabled} @change=${(e: Event) => this.hass!.callService(ALARM_DOMAIN, "update_alarm", { id: a.id, enabled: (e.target as HTMLInputElement).checked })}></ha-switch>
                  <span class="lbl">${a.label}</span><span class="t">${a.time}</span>
                  <ha-icon-button @click=${() => this.hass!.callService(ALARM_DOMAIN, "remove_alarm", { id: a.id })}><ha-icon icon="mdi:delete"></ha-icon></ha-icon-button>
                </div>`,
              )}
              <div class="row add">
                <input .value=${this._label} placeholder="Label" @input=${(e: Event) => (this._label = (e.target as HTMLInputElement).value)} />
                <input type="time" .value=${this._time} @input=${(e: Event) => (this._time = (e.target as HTMLInputElement).value)} />
                <ha-icon-button @click=${this._add}><ha-icon icon="mdi:plus"></ha-icon></ha-icon-button>
              </div>
            `}
      </ha-card>
    `;
  }

  static styles = [
    tedStyleTheme,
    css`
      .head { font-weight: 600; padding: 12px 14px 4px; }
      .row { display: flex; align-items: center; gap: 8px; padding: 6px 14px; }
      .lbl { flex: 1; }
      .t { color: var(--ted-style-muted); }
      .warn { padding: 14px; color: var(--ted-style-muted); }
      input { flex: 1; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-alarm-card": TedAlarmCard;
  }
}
