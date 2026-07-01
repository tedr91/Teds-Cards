import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import {
  TIMERS_SENSOR,
  TIMER_CARD_DESCRIPTION,
  TIMER_CARD_EDITOR_TYPE,
  TIMER_CARD_NAME,
  TIMER_CARD_TYPE,
  TIMER_DOMAIN,
  resolveTimerSectionOrder,
} from "./const";
import type { TimerCardConfig } from "./types";

interface ActiveTimer {
  id: string;
  name: string;
  ends: string;
  duration: number;
  remaining: number;
  paused: boolean;
}
interface RecentTimer {
  name: string;
  h: number;
  m: number;
  s: number;
}

/** Subset of Home Assistant's LovelaceGridOptions. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

registerCustomCard({
  type: TIMER_CARD_TYPE,
  name: TIMER_CARD_NAME,
  description: TIMER_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#timer-card",
});

@customElement(TIMER_CARD_TYPE)
export class TedTimerCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-timer-card-editor");
    return document.createElement(TIMER_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<TimerCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: TimerCardConfig;
  @state() private _name = "";
  @state() private _h = 0;
  @state() private _m = 5;
  @state() private _s = 0;
  /** null = closed; "add" = new-timer dialog; otherwise the id of the timer being edited. */
  @state() private _dialog: string | null = null;
  /** Ticks once a second while any timer is counting down. */
  private _tick?: number;

  public setConfig(config: TimerCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return { columns: 6, rows: "auto", min_columns: 4, min_rows: 2 };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTick();
  }

  private _sensor(): string {
    return this._config?.entity ?? TIMERS_SENSOR;
  }

  private _attr<T>(key: string): T[] {
    return (this.hass?.states[this._sensor()]?.attributes[key] as T[]) ?? [];
  }

  private _call(service: string, data: Record<string, unknown>): void {
    this.hass?.callService(TIMER_DOMAIN, service, data);
  }

  /** Live seconds remaining: frozen value when paused, else derived from `ends`. */
  private _remaining(t: ActiveTimer): number {
    if (t.paused) return Math.max(0, Math.round(t.remaining ?? 0));
    return Math.max(0, Math.round((new Date(t.ends).getTime() - Date.now()) / 1000));
  }

  private _openAdd(): void {
    this._name = "";
    this._h = 0;
    this._m = 5;
    this._s = 0;
    this._dialog = "add";
  }

  private _openEdit(t: ActiveTimer): void {
    const rem = this._remaining(t);
    this._name = t.name;
    this._h = Math.floor(rem / 3600);
    this._m = Math.floor((rem % 3600) / 60);
    this._s = rem % 60;
    this._dialog = t.id;
  }

  private _closeDialog(): void {
    this._dialog = null;
  }

  private _submitDialog(): void {
    const total = this._h * 3600 + this._m * 60 + this._s;
    if (this._dialog === "add") {
      if (total <= 0) return;
      this._call("start_timer", {
        name: this._name || "Timer",
        hours: this._h,
        minutes: this._m,
        seconds: this._s,
      });
    } else if (this._dialog) {
      this._call("update_timer", {
        id: this._dialog,
        name: this._name || "Timer",
        hours: this._h,
        minutes: this._m,
        seconds: this._s,
      });
    }
    this._closeDialog();
  }

  private _togglePause(t: ActiveTimer): void {
    this._call(t.paused ? "resume_timer" : "pause_timer", { id: t.id });
  }

  private _deleteTimer(): void {
    if (this._dialog && this._dialog !== "add") this._call("cancel_timer", { id: this._dialog });
    this._closeDialog();
  }

  private _startTick(): void {
    if (this._tick === undefined) this._tick = window.setInterval(() => this.requestUpdate(), 1000);
  }
  private _stopTick(): void {
    if (this._tick !== undefined) {
      window.clearInterval(this._tick);
      this._tick = undefined;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;

    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const shadow = cfg.shadow !== false;
    const brushed = cfg.brushed === true;
    const missing = !this.hass.states[this._sensor()];
    const active = this._attr<ActiveTimer>("active");
    const recent = this._attr<RecentTimer>("recent");
    const showActive = cfg.show_active !== false;
    const showAdd = cfg.show_add !== false;
    const showRecent = cfg.show_recent !== false;

    // Keep the countdown live only while a running (non-paused) timer exists.
    if (active.some((t) => !t.paused)) this._startTick();
    else this._stopTick();

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      "no-shadow": !shadow,
    };
    const cardStyle = appearanceStyle({ transparency: cfg.transparency, blur: cfg.blur });

    const sections = resolveTimerSectionOrder(cfg.section_order).map((section) => {
      if (section === "active") {
        if (!showActive) return nothing;
        return html`
          <div class="section">
            <div class="section-label">Active</div>
            ${active.length === 0
              ? html`<div class="empty">No timers running.</div>`
              : html`<div class="grid">${active.map((t) => this._renderActiveTile(t))}</div>`}
          </div>
        `;
      }
      if (section === "recent") {
        if (!showRecent || !recent.length) return nothing;
        return html`
          <div class="section">
            <div class="section-label">Recent</div>
            <div class="grid">${recent.map((r) => this._renderRecentTile(r))}</div>
          </div>
        `;
      }
      return nothing;
    });

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${brushed ? brushedOverlay : nothing}
        <div class="head">
          <ha-icon icon="mdi:timer-outline"></ha-icon>
          <span>${cfg.title ?? "Timers"}</span>
          ${!missing && showAdd
            ? html`<ha-icon-button class="add-hdr" label="New timer" @click=${this._openAdd}>
                <ha-icon icon="mdi:plus"></ha-icon>
              </ha-icon-button>`
            : nothing}
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use timers.</div>`
          : sections}
      </ha-card>
      ${this._dialog ? this._renderDialog() : nothing}
    `;
  }

  private _renderActiveTile(t: ActiveTimer): TemplateResult {
    const remaining = this._remaining(t);
    const duration = t.duration || 0;
    const frac = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
    return html`
      <div class="tile ${t.paused ? "paused" : ""}">
        <div class="bar"><div class="bar-fill" style=${styleMap({ width: `${frac * 100}%` })}></div></div>
        <div class="tile-body">
          <div class="rem">${this._fmtRemaining(remaining)}</div>
          <div class="tname" title=${t.name}>${t.name}</div>
        </div>
        <div class="tile-ctrl">
          <ha-icon-button
            class="play ${t.paused ? "accent" : ""}"
            .label=${t.paused ? `Resume ${t.name}` : `Pause ${t.name}`}
            @click=${() => this._togglePause(t)}
          >
            <ha-icon icon=${t.paused ? "mdi:play" : "mdi:pause"}></ha-icon>
          </ha-icon-button>
          <ha-icon-button class="gear" .label=${`Edit ${t.name}`} @click=${() => this._openEdit(t)}>
            <ha-icon icon="mdi:cog"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  private _renderRecentTile(r: RecentTimer): TemplateResult {
    const total = r.h * 3600 + r.m * 60 + r.s;
    return html`
      <div class="tile recent">
        <div class="tile-body">
          <div class="rem">${this._fmtRemaining(total)}</div>
          <div class="tname" title=${r.name}>${r.name}</div>
        </div>
        <div class="tile-ctrl">
          <ha-icon-button
            class="play accent"
            .label=${`Start ${r.name}`}
            @click=${() => this._call("start_timer", { name: r.name, hours: r.h, minutes: r.m, seconds: r.s })}
          >
            <ha-icon icon="mdi:play"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  private _renderDialog(): TemplateResult {
    const adding = this._dialog === "add";
    return html`
      <ha-dialog open heading=${adding ? "New timer" : "Edit timer"} @closed=${this._closeDialog}>
        <div class="dlg">
          <ha-textfield
            .value=${this._name}
            label="Name"
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this._submitDialog()}
          ></ha-textfield>
          <div class="hms">
            ${this._numField("Hours", this._h, 0, 23, (v) => (this._h = v))}
            ${this._numField("Minutes", this._m, 0, 59, (v) => (this._m = v))}
            ${this._numField("Seconds", this._s, 0, 59, (v) => (this._s = v))}
          </div>
        </div>
        <ha-button slot="secondaryAction" @click=${this._closeDialog}>Cancel</ha-button>
        ${adding
          ? nothing
          : html`<ha-button slot="secondaryAction" class="danger" @click=${this._deleteTimer}>Delete</ha-button>`}
        <ha-button
          slot="primaryAction"
          .disabled=${this._h * 3600 + this._m * 60 + this._s <= 0}
          @click=${this._submitDialog}
        >
          ${adding ? "Start" : "Save"}
        </ha-button>
      </ha-dialog>
    `;
  }

  private _numField(
    label: string,
    value: number,
    min: number,
    max: number,
    set: (v: number) => void,
  ): TemplateResult {
    return html`<label class="num">
      <input
        type="number"
        min=${min}
        max=${max}
        .value=${String(value)}
        @input=${(e: Event) => {
          const n = Number((e.target as HTMLInputElement).value);
          set(Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : 0);
        }}
      />
      <span>${label}</span>
    </label>`;
  }

  /** Seconds → "H:MM:SS" (drops the hours group when zero). */
  private _fmtRemaining(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  static styles = [
    tedStyleTheme,
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
        padding: 2px 4px 8px;
        color: var(--ted-style-muted);
        font-size: 0.9rem;
      }
      .section {
        padding: 4px 12px 8px;
      }
      .section + .section {
        border-top: 1px solid var(--ted-style-divider);
        margin-top: 2px;
      }
      .section-label {
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--ted-style-muted);
        padding: 6px 4px 8px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
      .tile {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        background: var(--ted-style-surface-2);
      }
      .bar {
        height: 3px;
        background: var(--ted-style-divider);
      }
      .bar-fill {
        height: 100%;
        background: var(--ted-style-accent);
        transition: width 0.5s linear;
      }
      .tile.paused .bar-fill {
        background: var(--ted-style-muted);
      }
      .tile-body {
        padding: 8px 10px 2px;
        min-width: 0;
      }
      .rem {
        font-size: 1.35rem;
        font-weight: 600;
        line-height: 1.15;
        font-variant-numeric: tabular-nums;
        color: var(--ted-style-accent);
      }
      .tile.paused .rem {
        color: var(--ted-style-muted);
      }
      .tname {
        font-size: 0.8rem;
        color: var(--ted-style-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tile-ctrl {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        padding: 2px 6px 6px;
      }
      .tile-ctrl ha-icon-button {
        flex: none;
        --mdc-icon-button-size: 40px;
        --mdc-icon-size: 22px;
        border-radius: var(--ted-style-radius-sm);
      }
      .play {
        color: var(--ted-style-muted);
      }
      .play.accent {
        color: var(--ted-style-on-accent);
        background: var(--ted-style-accent);
      }
      .gear {
        color: var(--ted-style-muted);
      }
      ha-textfield {
        --mdc-theme-primary: var(--ted-style-accent);
        --mdc-text-field-fill-color: var(--ted-style-surface-2);
        --mdc-text-field-ink-color: var(--ted-style-text);
        --mdc-text-field-label-ink-color: var(--ted-style-muted);
      }
      .dlg {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 260px;
      }
      .danger {
        --mdc-theme-primary: var(--error-color, #db4437);
      }
      .hms {
        display: flex;
        gap: 10px;
      }
      .num {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: 0.72rem;
        color: var(--secondary-text-color, var(--ted-style-muted));
      }
      .num input {
        width: 64px;
        appearance: none;
        background: var(--secondary-background-color, var(--ted-style-surface-2));
        color: var(--primary-text-color, var(--ted-style-text));
        border: 1px solid var(--divider-color, var(--ted-style-divider));
        border-radius: var(--ted-style-radius-sm);
        padding: 9px 4px;
        font: inherit;
        text-align: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-timer-card": TedTimerCard;
  }
}
