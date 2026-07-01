import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { showConfirmation, modalStyles } from "../../shared/dialogs";
import {
  ALARMS_SENSOR,
  ALARM_CARD_DESCRIPTION,
  ALARM_CARD_EDITOR_TYPE,
  ALARM_CARD_NAME,
  ALARM_CARD_TYPE,
  ALARM_DOMAIN,
} from "./const";
import type { AlarmCardConfig } from "./types";

interface Alarm {
  id: string;
  label: string;
  time: string;
  days: number[];
  description?: string;
  enabled: boolean;
}

/** Backend day indices (0–6) → short labels. Python weekday convention (Mon = 0). */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Subset of Home Assistant's LovelaceGridOptions. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

registerCustomCard({
  type: ALARM_CARD_TYPE,
  name: ALARM_CARD_NAME,
  description: ALARM_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#alarm-card",
});

@customElement(ALARM_CARD_TYPE)
export class TedAlarmCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-alarm-card-editor");
    return document.createElement(ALARM_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<AlarmCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AlarmCardConfig;
  @state() private _label = "";
  @state() private _time = "07:00";
  /** Selected repeat days (Python weekday convention, Mon = 0). */
  @state() private _days: number[] = [0, 1, 2, 3, 4, 5, 6];
  /** Whether the add/edit alarm dialog is open. */
  @state() private _addOpen = false;
  /** null = adding a new alarm; otherwise the id of the alarm being edited. */
  @state() private _editId: string | null = null;

  public setConfig(config: AlarmCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return { columns: 6, rows: "auto", min_columns: 4, min_rows: 2 };
  }

  private _sensor(): string {
    return this._config?.entity ?? ALARMS_SENSOR;
  }

  private get _alarms(): Alarm[] {
    return (this.hass?.states[this._sensor()]?.attributes.alarms as Alarm[]) ?? [];
  }

  /** Minutes-since-midnight for a "HH:MM[:SS]" time, used for sorting. */
  private _minutes(t: string): number {
    const [h, m] = (t ?? "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** Enabled alarms first, then earliest time of day first. */
  private get _sortedAlarms(): Alarm[] {
    return [...this._alarms].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return this._minutes(a.time) - this._minutes(b.time);
    });
  }

  private _call(service: string, data: Record<string, unknown>): void {
    this.hass?.callService(ALARM_DOMAIN, service, data);
  }

  private _openAdd(): void {
    this._editId = null;
    this._label = "";
    this._time = "07:00";
    this._days = [0, 1, 2, 3, 4, 5, 6];
    this._addOpen = true;
  }

  private _openEdit(a: Alarm): void {
    this._editId = a.id;
    this._label = a.label ?? "";
    this._time = (a.time ?? "07:00").slice(0, 5);
    this._days = Array.isArray(a.days) ? [...a.days] : [];
    this._addOpen = true;
  }

  private _closeAdd(): void {
    this._addOpen = false;
    this._editId = null;
  }

  private _toggleDay(d: number): void {
    this._days = this._days.includes(d)
      ? this._days.filter((x) => x !== d)
      : [...this._days, d].sort((a, b) => a - b);
  }

  private _submitAdd(): void {
    if (!this._label) return;
    if (this._editId) {
      this._call("update_alarm", {
        id: this._editId,
        label: this._label,
        time: this._time,
        days: this._days,
      });
    } else {
      this._call("add_alarm", { label: this._label, time: this._time, days: this._days });
    }
    this._closeAdd();
  }

  private async _confirmDelete(a: Alarm): Promise<void> {
    const confirmed = await showConfirmation(this, {
      title: "Delete alarm",
      text: `Delete "${a.label}"?`,
      confirmText: "Delete",
      dismissText: "Cancel",
      destructive: true,
    });
    if (confirmed) this._call("remove_alarm", { id: a.id });
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;

    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const shadow = cfg.shadow !== false;
    const brushed = cfg.brushed === true;
    const missing = !this.hass.states[this._sensor()];
    const alarms = this._sortedAlarms;
    const showAdd = cfg.show_add !== false;

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      "no-shadow": !shadow,
    };
    const cardStyle = appearanceStyle({ transparency: cfg.transparency, blur: cfg.blur });

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${brushed ? brushedOverlay : nothing}
        <div class="head">
          <ha-icon icon="mdi:alarm"></ha-icon>
          <span>${cfg.title ?? "Alarms"}</span>
          ${!missing && showAdd
            ? html`<ha-icon-button class="add-hdr" label="New alarm" @click=${this._openAdd}>
                <ha-icon icon="mdi:plus"></ha-icon>
              </ha-icon-button>`
            : nothing}
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use alarms.</div>`
          : html`
              <div class="list">
                ${alarms.length === 0
                  ? html`<div class="empty">No alarms yet.</div>`
                  : alarms.map((a) => this._renderAlarm(a))}
              </div>
            `}
      </ha-card>
      ${this._addOpen ? this._renderAddDialog() : nothing}
    `;
  }

  private _renderAlarm(a: Alarm): TemplateResult {
    const grouped = this._daysLabel(a.days);
    return html`
      <div class="row ${a.enabled ? "" : "off"}">
        <div class="info">
          <div class="time">${this._fmtTime(a.time)}</div>
          <div class="label">${a.label}</div>
          ${a.description ? html`<div class="desc">${a.description}</div>` : nothing}
          ${Array.isArray(a.days) && a.days.length
            ? html`<div class="days">
                ${grouped
                  ? html`<span>${grouped}</span>`
                  : a.days.map((d) => html`<span>${DAY_LABELS[d] ?? d}</span>`)}
              </div>`
            : nothing}
        </div>
        <ha-switch
          .checked=${a.enabled}
          @change=${(e: Event) =>
            this._call("update_alarm", { id: a.id, enabled: (e.target as HTMLInputElement).checked })}
        ></ha-switch>
        <ha-icon-button class="gear" .label=${`Edit ${a.label}`} @click=${() => this._openEdit(a)}>
          <ha-icon icon="mdi:cog"></ha-icon>
        </ha-icon-button>
        <ha-icon-button class="del" .label=${`Delete ${a.label}`} @click=${() => this._confirmDelete(a)}>
          <ha-icon icon="mdi:delete-outline"></ha-icon>
        </ha-icon-button>
      </div>
    `;
  }

  private _renderAddDialog(): TemplateResult {
    const theme = this._config?.theme === "ted-style" ? "ted-style" : "ha";
    return html`
      <div
        class="ted-modal ${tedCardThemeClass(theme)}"
        @click=${this._closeAdd}
        @keydown=${(e: KeyboardEvent) => e.key === "Escape" && this._closeAdd()}
      >
        <div class="ted-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="ted-sheet-head">${this._editId ? "Edit alarm" : "New alarm"}</div>
          <div class="ted-sheet-body">
            <label class="ted-field">
              <span class="ted-field-label">Label</span>
              <input
                class="ted-input"
                .value=${this._label}
                @input=${(e: Event) => (this._label = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this._submitAdd()}
              />
            </label>
            <label class="ted-field">
              <span class="ted-field-label">Time</span>
              <input
                class="ted-input"
                type="time"
                .value=${this._time}
                @input=${(e: Event) => (this._time = (e.target as HTMLInputElement).value)}
              />
            </label>
            <div class="ted-field">
              <span class="ted-field-label">Repeat</span>
              <div class="ted-days">
                ${DAY_LABELS.map(
                  (label, d) => html`<button
                    type="button"
                    class="ted-daybtn ${this._days.includes(d) ? "on" : ""}"
                    aria-pressed=${this._days.includes(d)}
                    @click=${() => this._toggleDay(d)}
                  >
                    ${label}
                  </button>`,
                )}
              </div>
            </div>
          </div>
          <div class="ted-sheet-foot">
            <button class="ted-btn" @click=${this._closeAdd}>Cancel</button>
            <button class="ted-btn primary" ?disabled=${!this._label} @click=${this._submitAdd}>
              ${this._editId ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /** Condense a day set into "Every day" / "Weekdays" / "Weekends", else null. */
  private _daysLabel(days: number[] | undefined): string | null {
    if (!Array.isArray(days)) return null;
    const s = [...new Set(days)].sort((a, b) => a - b);
    const eq = (arr: number[]) => s.length === arr.length && arr.every((v, i) => v === s[i]);
    if (eq([0, 1, 2, 3, 4, 5, 6])) return "Every day";
    if (eq([0, 1, 2, 3, 4])) return "Weekdays";
    if (eq([5, 6])) return "Weekends";
    return null;
  }

  /** Format a "HH:MM[:SS]" backend time as a 12-hour clock, e.g. "7:05am". */
  private _fmtTime(t: string): string {
    const [hStr, mStr] = (t ?? "").split(":");
    let h = Number(hStr);
    if (!Number.isFinite(h)) return t;
    const m = (mStr ?? "00").padStart(2, "0");
    const suffix = h >= 12 ? "pm" : "am";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m}${suffix}`;
  }

  static styles = [
    tedStyleTheme,
    modalStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        height: 100%;
        box-sizing: border-box;
        padding: 4px 0 10px;
        display: flex;
        flex-direction: column;
        color: var(--ted-style-text);
      }
      ha-card.no-shadow {
        box-shadow: none;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 1.05rem;
        padding: 12px 16px 8px;
      }
      .head ha-icon {
        color: var(--ted-style-accent);
        --mdc-icon-size: 22px;
      }
      .add-hdr {
        margin-left: auto;
        color: var(--ted-style-accent);
        flex: none;
      }
      .warn {
        padding: 8px 16px 16px;
        color: var(--ted-style-muted);
      }
      .empty {
        padding: 6px 16px 12px;
        color: var(--ted-style-muted);
        font-size: 0.9rem;
      }
      .list {
        display: flex;
        flex-direction: column;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 8px 10px 16px;
        border-top: 1px solid var(--ted-style-divider);
      }
      .row.off {
        opacity: 0.55;
      }
      .info {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .time {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
      }
      .label {
        color: var(--ted-style-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .desc {
        font-size: 0.82rem;
        color: var(--ted-style-muted);
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 2px;
      }
      .days span {
        font-size: 0.7rem;
        line-height: 1;
        padding: 3px 6px;
        border-radius: var(--ted-style-radius-sm);
        background: var(--ted-style-surface-2);
        color: var(--ted-style-muted);
      }
      .del {
        color: var(--ted-style-muted);
        flex: none;
      }
      .gear {
        color: var(--ted-style-muted);
        flex: none;
      }
      ha-textfield {
        --mdc-theme-primary: var(--ted-style-accent);
        --mdc-text-field-fill-color: var(--ted-style-surface-2);
        --mdc-text-field-ink-color: var(--ted-style-text);
        --mdc-text-field-label-ink-color: var(--ted-style-muted);
      }
      ha-switch {
        --mdc-theme-secondary: var(--ted-style-accent);
        flex: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-alarm-card": TedAlarmCard;
  }
}
