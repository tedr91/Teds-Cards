import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { modalStyles } from "../../shared/dialogs";
import { NotificationToastController } from "../../shared/notifications";
import "../../shared/ted-icon-button";
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
  location?: string;
}
interface RecentTimer {
  name: string;
  h: number;
  m: number;
  s: number;
  location?: string;
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
  /** The recent preset whose long-press action menu is open (null = closed). */
  @state() private _recentMenu: RecentTimer | null = null;
  /** Ticks once a second while any timer is counting down. */
  private _tick?: number;
  /** Long-press detection for recent tiles. */
  private _lpTimer?: number;
  private _lpFired = false;

  public constructor() {
    super();
    // Pops toasts for backend notifications (timer completions route through these).
    new NotificationToastController(this, () => ({ hass: this.hass, area: this._config?.area }));
  }

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
    return TIMERS_SENSOR;
  }

  /** Friendly name of an HA area_id, via the frontend area registry. */
  private _areaName(id?: string): string | undefined {
    if (!id) return undefined;
    const areas = (this.hass as { areas?: Record<string, { name?: string }> } | undefined)?.areas;
    return areas?.[id]?.name;
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

  private _openRecent(r: RecentTimer): void {
    this._name = r.name;
    this._h = r.h;
    this._m = r.m;
    this._s = r.s;
    this._dialog = "add";
  }

  // ── recent tile: tap starts, long-press opens the Delete menu ──────────────
  private _onRecentPointerDown(r: RecentTimer): void {
    this._lpFired = false;
    this._clearLongPress();
    this._lpTimer = window.setTimeout(() => {
      this._lpFired = true;
      this._recentMenu = r;
    }, 500);
  }
  private _clearLongPress = (): void => {
    if (this._lpTimer !== undefined) {
      window.clearTimeout(this._lpTimer);
      this._lpTimer = undefined;
    }
  };
  private _onRecentClick(r: RecentTimer): void {
    // Suppress the click that follows a long-press.
    if (this._lpFired) {
      this._lpFired = false;
      return;
    }
    this._openRecent(r);
  }
  private _closeRecentMenu = (): void => {
    this._recentMenu = null;
  };
  private _deleteRecent = (): void => {
    const r = this._recentMenu;
    if (r) {
      this._call("remove_recent", {
        name: r.name,
        hours: r.h,
        minutes: r.m,
        seconds: r.s,
        ...(r.location ? { location: r.location } : {}),
      });
    }
    this._closeRecentMenu();
  };

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
        ...(this._config?.area ? { location: this._config.area } : {}),
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
    const area = cfg.area;
    const active = this._attr<ActiveTimer>("active").filter((t) => !area || t.location === area);
    const recent = this._attr<RecentTimer>("recent").filter((r) => !area || r.location === area);
    const showActive = cfg.show_active !== false;
    const showAdd = cfg.show_add !== false;
    const showRecent = cfg.show_recent !== false;
    const showIcon = cfg.show_header_icon !== false;
    const showName = cfg.show_header_name !== false;
    const iconScale = typeof cfg.header_icon_size === "number" ? cfg.header_icon_size : 100;
    const nameScale = typeof cfg.header_name_size === "number" ? cfg.header_name_size : 100;
    const scale = typeof cfg.scale === "number" ? cfg.scale : 100;
    const headerDivider = cfg.header_divider === true;

    // Keep the countdown live only while a running (non-paused) timer exists.
    if (active.some((t) => !t.paused)) this._startTick();
    else this._stopTick();

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      "no-shadow": !shadow,
    };
    const cardStyle = appearanceStyle({
      background: cssColor(cfg.background),
      transparency: cfg.transparency,
      blur: cfg.blur,
    });
    if (scale !== 100) cardStyle.zoom = String(scale / 100);

    const sections = resolveTimerSectionOrder(cfg.section_order).map((section) => {
      if (section === "active") {
        if (!showActive) return nothing;
        return html`
          <div class="section">
            <div class="section-label">Active</div>
            ${active.length === 0
              ? html`<div class="empty">No timers running.</div>`
              : html`<div class="grid grid-active">
                  ${repeat(
                    active,
                    (t) => t.id,
                    (t) => this._renderActiveTile(t),
                  )}
                </div>`}
          </div>
        `;
      }
      if (section === "recent") {
        if (!showRecent || !recent.length) return nothing;
        return html`
          <div class="section">
            <div class="section-label">Recent</div>
            <div class="grid">
              ${repeat(
                recent,
                (r) => `${r.name}|${r.h}:${r.m}:${r.s}`,
                (r) => this._renderRecentTile(r),
              )}
            </div>
          </div>
        `;
      }
      return nothing;
    });

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${brushed ? brushedOverlay : nothing}
        <div class="head ${headerDivider ? "with-divider" : ""}">
          ${showIcon
            ? html`<ha-icon
                icon="mdi:timer-outline"
                style=${styleMap({ "--mdc-icon-size": `calc(22px * ${iconScale / 100})` })}
              ></ha-icon>`
            : nothing}
          ${showName
            ? html`<span style=${styleMap({ fontSize: `calc(1.05rem * ${nameScale / 100})` })}
                >${cfg.title ?? "Timers"}</span
              >`
            : nothing}
          ${!missing && showAdd
            ? html`<ted-icon-button
                class="add-hdr"
                icon="mdi:plus"
                label="New timer"
                @click=${this._openAdd}
              ></ted-icon-button>`
            : nothing}
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use timers.</div>`
          : html`<div class="body">${sections}</div>`}
      </ha-card>
      ${this._dialog ? this._renderDialog() : nothing}
      ${this._recentMenu ? this._renderRecentMenu() : nothing}
    `;
  }

  private _renderActiveTile(t: ActiveTimer): TemplateResult {
    const remaining = this._remaining(t);
    const duration = t.duration || 0;
    const frac = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
    const roomName = this._config?.area ? undefined : this._areaName(t.location);
    return html`
      <div class="tile ${t.paused ? "paused" : ""}">
        <div class="bar"><div class="bar-fill" style=${styleMap({ width: `${frac * 100}%` })}></div></div>
        <div class="tile-body">
          <div class="rem">${this._fmtRemaining(remaining)}</div>
          <div class="tname" title=${t.name}>
            ${t.name}${roomName ? html`<span class="room">${roomName}</span>` : nothing}
          </div>
        </div>
        <div class="tile-ctrl">
          <ted-icon-button
            tone=${t.paused ? "caution" : "muted"}
            icon=${t.paused ? "mdi:play" : "mdi:pause"}
            .label=${t.paused ? `Resume ${t.name}` : `Pause ${t.name}`}
            @click=${() => this._togglePause(t)}
          ></ted-icon-button>
          <ted-icon-button
            icon="mdi:cog"
            .label=${`Edit ${t.name}`}
            @click=${() => this._openEdit(t)}
          ></ted-icon-button>
        </div>
      </div>
    `;
  }

  private _renderRecentTile(r: RecentTimer): TemplateResult {
    const total = r.h * 3600 + r.m * 60 + r.s;
    const roomName = this._config?.area ? undefined : this._areaName(r.location);
    return html`
      <button
        class="tile recent"
        title=${`Start ${r.name}`}
        @click=${() => this._onRecentClick(r)}
        @pointerdown=${() => this._onRecentPointerDown(r)}
        @pointerup=${this._clearLongPress}
        @pointerleave=${this._clearLongPress}
        @pointercancel=${this._clearLongPress}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <span class="rem">${this._fmtRemaining(total)}</span>
        <span class="tname">(${r.name})${roomName ? html`<span class="room">${roomName}</span>` : nothing}</span>
      </button>
    `;
  }

  private _renderRecentMenu(): TemplateResult {
    const r = this._recentMenu!;
    const theme = this._config?.theme === "ted-style" ? "ted-style" : "ha";
    return html`
      <div
        class="ted-modal ${tedCardThemeClass(theme)}"
        @click=${this._closeRecentMenu}
        @keydown=${(e: KeyboardEvent) => e.key === "Escape" && this._closeRecentMenu()}
      >
        <div class="ted-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="ted-sheet-head">${this._fmtRemaining(r.h * 3600 + r.m * 60 + r.s)} (${r.name})</div>
          <div class="ted-sheet-foot">
            <button class="ted-btn danger" @click=${this._deleteRecent}>Delete</button>
            <button class="ted-btn" @click=${this._closeRecentMenu}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderDialog(): TemplateResult {
    const adding = this._dialog === "add";
    const theme = this._config?.theme === "ted-style" ? "ted-style" : "ha";
    const total = this._h * 3600 + this._m * 60 + this._s;
    return html`
      <div
        class="ted-modal ${tedCardThemeClass(theme)}"
        @click=${this._closeDialog}
        @keydown=${(e: KeyboardEvent) => e.key === "Escape" && this._closeDialog()}
      >
        <div class="ted-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="ted-sheet-head">${adding ? "New timer" : "Edit timer"}</div>
          <div class="ted-sheet-body">
            <label class="ted-field">
              <span class="ted-field-label">Name</span>
              <input
                class="ted-input"
                .value=${this._name}
                @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this._submitDialog()}
              />
            </label>
            <div class="ted-hms">
              ${this._numField("Hours", this._h, 0, 23, (v) => (this._h = v))}
              ${this._numField("Minutes", this._m, 0, 59, (v) => (this._m = v))}
              ${this._numField("Seconds", this._s, 0, 59, (v) => (this._s = v))}
            </div>
          </div>
          <div class="ted-sheet-foot">
            ${adding
              ? nothing
              : html`<button class="ted-btn danger" @click=${this._deleteTimer}>Delete</button>`}
            <button class="ted-btn" @click=${this._closeDialog}>Cancel</button>
            <button class="ted-btn primary" ?disabled=${total <= 0} @click=${this._submitDialog}>
              ${adding ? "Start" : "Save"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _numField(
    label: string,
    value: number,
    min: number,
    max: number,
    set: (v: number) => void,
  ): TemplateResult {
    return html`<label class="ted-field">
      <span class="ted-field-label">${label}</span>
      <input
        class="ted-input"
        type="number"
        min=${min}
        max=${max}
        .value=${String(value)}
        @input=${(e: Event) => {
          const n = Number((e.target as HTMLInputElement).value);
          set(Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : 0);
        }}
      />
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
        container-type: inline-size;
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
        flex: none;
      }
      .head.with-divider {
        border-bottom: 1px solid var(--ted-style-divider);
      }
      .body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
      }
      .head ha-icon {
        color: var(--ted-style-text);
        --mdc-icon-size: 22px;
      }
      .add-hdr {
        margin-left: auto;
        --ted-ib-color: var(--ted-style-text);
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
      .grid-active {
        grid-template-columns: 1fr;
      }
      .tile {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        background: var(--ted-style-surface-2);
      }
      .bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
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
        flex: 1 1 auto;
        min-width: 0;
        padding: 8px 10px;
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
      .room {
        margin-left: 6px;
        font-size: 0.62rem;
        padding: 2px 5px;
        border-radius: var(--ted-style-radius-sm);
        background: color-mix(in srgb, var(--ted-style-accent) 22%, transparent);
        color: var(--ted-style-text);
        white-space: nowrap;
      }
      .tile.recent {
        appearance: none;
        font: inherit;
        cursor: pointer;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        text-align: left;
        width: 100%;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      .tile.recent:hover {
        border-color: var(--ted-style-accent);
      }
      .tile.recent .rem {
        flex: none;
        font-size: 1.1rem;
        line-height: 1;
        color: var(--ted-style-muted);
      }
      .tile.recent .tname {
        flex: 1 1 auto;
        min-width: 0;
        line-height: 1;
      }
      .tile-ctrl {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        padding: 0 6px;
      }
      /* Shrink the tile controls when the card itself is narrow. */
      @container (max-width: 320px) {
        .tile-ctrl {
          gap: 0;
        }
        .tile-ctrl ted-icon-button {
          --ted-ib-size: 26px;
          --ted-ib-icon: 18px;
        }
      }
      ha-textfield {
        --mdc-theme-primary: var(--ted-style-accent);
        --mdc-text-field-fill-color: var(--ted-style-surface-2);
        --mdc-text-field-ink-color: var(--ted-style-text);
        --mdc-text-field-label-ink-color: var(--ted-style-muted);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-timer-card": TedTimerCard;
  }
}
