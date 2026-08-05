import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { tedStyleTheme, tedCardThemeClass } from "../../shared/theme";
import { themedIcon } from "../../shared/icons";
import { showConfirmation, modalStyles } from "../../shared/dialogs";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  FALSE_ALARM_COLOR,
  FALSE_ALARM_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  VISION_CARD_DESCRIPTION,
  VISION_CARD_EDITOR_TYPE,
  VISION_CARD_NAME,
  VISION_CARD_TYPE,
  VISION_SEVERITIES,
  type VisionSeverity,
} from "./const";
import type { VisionCardConfig, VisionEvent } from "./types";

const DOMAIN = "teds_dashboard_system";

/** Home Assistant's `loadCardHelpers()` return shape (only what this card uses). */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

/** Live-feed message shapes from `subscribe_vision_events`. */
type VisionFeed =
  | { events: VisionEvent[] }
  | { event: VisionEvent }
  | { id: string; deleted: true }
  | { cleared: true };

registerCustomCard({
  type: VISION_CARD_TYPE,
  name: VISION_CARD_NAME,
  description: VISION_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#vision-card",
});

@customElement(VISION_CARD_TYPE)
export class TedVisionCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-vision-card-editor");
    return document.createElement(VISION_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<VisionCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: VisionCardConfig;
  @state() private _events: VisionEvent[] = [];
  @state() private _severityFilter?: VisionSeverity;
  /** When on, show only events the AI flagged as false alarms. */
  @state() private _falseAlarmOnly = false;
  @state() private _detailId?: string;
  /** ai_task availability: undefined = not checked, true/false once known. */
  @state() private _aiTaskOk?: boolean;

  private _sub?: Promise<() => void>;
  private _helpers?: CardHelpers;
  private _msgCard?: LovelaceCard;
  private _msgJson?: string;
  private _lastHass?: HomeAssistant;

  public constructor() {
    super();
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: VisionCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 6;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
    this._subscribe();
    void this._checkAiTask();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._sub?.then((unsub) => unsub()).catch(() => undefined);
    this._sub = undefined;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass") && this.hass) {
      if (!this._sub) this._subscribe();
      if (this._aiTaskOk === undefined) void this._checkAiTask();
      if (this.hass !== this._lastHass) {
        this._lastHass = this.hass;
        if (this._msgCard) this._msgCard.hass = this.hass;
      }
    }
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers) return;
    const loader = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> })
      .loadCardHelpers;
    if (loader) {
      this._helpers = await loader();
      this.requestUpdate();
    }
  }

  private _subscribe(): void {
    const conn = (this.hass as unknown as {
      connection?: {
        subscribeMessage: <T>(cb: (ev: T) => void, msg: { type: string }) => Promise<() => void>;
      };
    })?.connection;
    if (!conn || this._sub) return;
    this._sub = conn.subscribeMessage<VisionFeed>(
      (ev) => this._onFeed(ev),
      { type: `${DOMAIN}/subscribe_vision_events` },
    );
  }

  private _onFeed(ev: VisionFeed): void {
    if ("events" in ev) {
      this._events = ev.events;
    } else if ("cleared" in ev) {
      this._events = [];
    } else if ("deleted" in ev) {
      this._events = this._events.filter((e) => e.id !== ev.id);
      if (this._detailId === ev.id) this._detailId = undefined;
    } else if ("event" in ev) {
      // Update in place so a re-analysis / mark-reviewed keeps its chronological spot;
      // only a genuinely new event goes to the top.
      const idx = this._events.findIndex((e) => e.id === ev.event.id);
      if (idx >= 0) {
        const next = [...this._events];
        next[idx] = ev.event;
        this._events = next;
      } else {
        this._events = [ev.event, ...this._events];
      }
    }
  }

  private async _checkAiTask(): Promise<void> {
    const hass = this.hass as unknown as {
      callWS?: <T>(msg: Record<string, unknown>) => Promise<T>;
    };
    if (!hass?.callWS) return;
    try {
      const res = await hass.callWS<{ entities: { supports_attachments?: boolean }[] }>({
        type: `${DOMAIN}/list_ai_task_entities`,
      });
      this._aiTaskOk = (res.entities ?? []).some((e) => e.supports_attachments);
    } catch {
      this._aiTaskOk = false;
    }
  }

  private _filtered(): VisionEvent[] {
    const cams = this._config?.cameras;
    const max = this._config?.max_events ?? 50;
    let list = this._events;
    if (cams && cams.length) list = list.filter((e) => cams.includes(e.camera_id));
    if (this._severityFilter) list = list.filter((e) => e.severity === this._severityFilter);
    if (this._falseAlarmOnly) list = list.filter((e) => e.false_alarm);
    return list.slice(0, max);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClass = tedCardThemeClass(themeMode);
    const events = this._filtered();

    let body: TemplateResult;
    if (events.length) {
      body = this._renderList(events);
    } else if (this._aiTaskOk === false && this._events.length === 0) {
      body = this._renderMessage(this._onboardingConfig());
    } else {
      body = this._renderMessage(this._emptyConfig());
    }

    return html`
      <ha-card class="vision-root ${themeClass}">
        <div class="vision-head">
          <div class="vision-title">
            <ha-icon icon=${themedIcon("camera")}></ha-icon>
            <span>${this._config.title ?? "Vision Events"}</span>
          </div>
          ${this._renderFilter()}
        </div>
        ${body}
      </ha-card>
      ${this._renderDetail()}
    `;
  }

  private _renderFilter(): TemplateResult | typeof nothing {
    if (!this._events.length) return nothing;
    const admin = !!(this.hass as unknown as { user?: { is_admin?: boolean } })?.user?.is_admin;
    return html`<div class="vision-filter">
      <button
        class="chip ${this._severityFilter ? "" : "on"}"
        @click=${() => (this._severityFilter = undefined)}
      >
        All
      </button>
      ${VISION_SEVERITIES.map(
        (s) => html`<button
          class="chip ${this._severityFilter === s ? "on" : ""}"
          style="--chip: ${SEVERITY_COLOR[s]}"
          @click=${() => (this._severityFilter = s)}
        >
          ${SEVERITY_LABEL[s]}
        </button>`,
      )}
      <button
        class="chip ${this._falseAlarmOnly ? "on" : ""}"
        style="--chip: ${FALSE_ALARM_COLOR}"
        title="Show only likely false alarms"
        @click=${() => (this._falseAlarmOnly = !this._falseAlarmOnly)}
      >
        ${FALSE_ALARM_LABEL}
      </button>
      <div class="filter-actions">
        <ha-icon-button class="filter-act" title="Mark all reviewed" @click=${this._markAllReviewed}>
          <ha-icon icon="mdi:check-all"></ha-icon>
        </ha-icon-button>
        ${admin
          ? html`<ha-icon-button class="filter-act" title="Clear all" @click=${this._clearAll}>
              <ha-icon icon="mdi:delete-sweep-outline"></ha-icon>
            </ha-icon-button>`
          : nothing}
      </div>
    </div>`;
  }

  private _markAllReviewed = (): void => {
    const hass = this.hass as unknown as {
      callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
    };
    if (!hass?.callWS) return;
    for (const e of this._events) {
      if (!e.reviewed) {
        void hass.callWS({ type: `${DOMAIN}/mark_vision_reviewed`, event_id: e.id, reviewed: true });
      }
    }
  };

  private _clearAll = async (): Promise<void> => {
    const ok = await showConfirmation(this, {
      title: "Clear all events?",
      text: "This permanently removes all analyzed events and their snapshots/clips.",
      confirmText: "Clear all",
      destructive: true,
    });
    if (!ok) return;
    const hass = this.hass as unknown as {
      callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
    };
    void hass?.callWS?.({ type: `${DOMAIN}/clear_vision_events` });
    this._detailId = undefined;
  };

  private _renderList(events: VisionEvent[]): TemplateResult {
    return html`<div class="vision-list">
      ${repeat(
        events,
        (e) => e.id,
        (e) => html`<button
          class="row ${e.reviewed ? "reviewed" : ""} ${e.analyzing ? "analyzing" : ""}"
          @click=${() => (this._detailId = e.id)}
        >
          <div class="thumb" style="--sev: ${SEVERITY_COLOR[e.severity]}">
            ${e.thumbnail_url
              ? html`<img src=${e.thumbnail_url} alt="" loading="lazy" />`
              : html`<ha-icon icon=${themedIcon("camera")}></ha-icon>`}
            ${e.clip_url ? html`<ha-icon class="play" icon="mdi:play-circle"></ha-icon>` : nothing}
          </div>
          <div class="info">
            <div class="line1">
              <span class="badge" style="--sev: ${SEVERITY_COLOR[e.severity]}"
                >${SEVERITY_LABEL[e.severity]}</span
              >
              ${e.false_alarm
                ? html`<span class="fa-tag" style="--sev: ${FALSE_ALARM_COLOR}">${FALSE_ALARM_LABEL}</span>`
                : nothing}
              ${e.analyzing ? html`<span class="analyzing-tag">Analyzing…</span>` : nothing}
              <span class="cam">${e.camera_name}</span>
              <span class="time">${this._relTime(e.ts_start)}</span>
            </div>
            <div class="summary">${e.short_summary || "(no summary)"}</div>
          </div>
        </button>`,
      )}
    </div>`;
  }

  private _renderDetail(): TemplateResult | typeof nothing {
    const e = this._events.find((x) => x.id === this._detailId);
    if (!e) return nothing;
    const themeClass = tedCardThemeClass(this._config?.theme === "ha" ? "ha" : "ted-style");
    return html`<div class="ted-modal ${themeClass}" @click=${() => (this._detailId = undefined)}>
      <div class="ted-sheet vision-detail" @click=${(ev: Event) => ev.stopPropagation()}>
        <div class="ted-sheet-head">
          <span class="badge" style="--sev: ${SEVERITY_COLOR[e.severity]}"
            >${SEVERITY_LABEL[e.severity]}</span
          >
          ${e.false_alarm
            ? html`<span class="fa-tag" style="--sev: ${FALSE_ALARM_COLOR}">${FALSE_ALARM_LABEL}</span>`
            : nothing}
          ${e.analyzing ? html`<span class="analyzing-tag">Analyzing…</span>` : nothing}
          ${e.camera_name}
        </div>
        <div class="ted-sheet-body">
          ${e.clip_url
            ? html`<video class="media" src=${e.clip_url} controls playsinline
                poster=${e.thumbnail_url ?? ""}></video>`
            : e.thumbnail_url
              ? html`<img class="media" src=${e.thumbnail_url} alt="" />`
              : nothing}
          <div class="meta">
            ${this._relTime(e.ts_start)} · ${e.event_type}${e.area_name
              ? html` · ${e.area_name}`
              : nothing}
          </div>
          <div class="long">${e.long_summary || e.short_summary || "(no details)"}</div>
          <div class="detail-actions">
            <button class="ted-btn" @click=${() => this._markReviewed(e)}>
              ${e.reviewed ? "Mark unreviewed" : "Mark reviewed"}
            </button>
            <button class="ted-btn danger" @click=${() => this._delete(e)}>Delete</button>
            <button class="ted-btn primary" @click=${() => (this._detailId = undefined)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }

  private _markReviewed(e: VisionEvent): void {
    const hass = this.hass as unknown as {
      callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
    };
    void hass?.callWS?.({
      type: `${DOMAIN}/mark_vision_reviewed`,
      event_id: e.id,
      reviewed: !e.reviewed,
    });
  }

  private async _delete(e: VisionEvent): Promise<void> {
    const ok = await showConfirmation(this, {
      title: "Delete event?",
      text: "This removes the analyzed event and its snapshot/clip.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const hass = this.hass as unknown as {
      callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
    };
    void hass?.callWS?.({ type: `${DOMAIN}/delete_vision_event`, event_id: e.id });
    if (this._detailId === e.id) this._detailId = undefined;
  }

  private _relTime(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const diff = Math.max(0, Date.now() - t) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  private _settingsPath(): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const raw = this._config?.settings_path || "[root]/settings?tab=vision";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  private _emptyConfig(): LovelaceCardConfig {
    return {
      type: "custom:ted-messagebox-card",
      theme: "ted-style",
      severity: "info",
      icon: themedIcon("camera"),
      title: this._config?.empty_title ?? "No vision events yet",
      message:
        this._config?.empty_message ??
        "Opt cameras into Vision Analysis in Settings, then detected events will appear here.",
      actions: [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          action: "navigate",
          navigation_path: this._settingsPath(),
          variant: "primary",
        },
      ],
    };
  }

  private _onboardingConfig(): LovelaceCardConfig {
    return {
      type: "custom:ted-messagebox-card",
      theme: "ted-style",
      severity: "warning",
      icon: "mdi:robot-outline",
      title: "AI Task setup needed",
      message:
        "Vision Analysis uses Home Assistant's AI Task. Install an AI provider that " +
        "supports image attachments (e.g. OpenAI or Ollama), set it as your preferred " +
        "AI Task entity in Settings → Voice assistants, then enable Vision in Settings.",
      actions: [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          action: "navigate",
          navigation_path: this._settingsPath(),
          variant: "primary",
        },
      ],
    };
  }

  private _renderMessage(cfg: LovelaceCardConfig): TemplateResult {
    if (!this._helpers) return html`<div class="msg-wrap"></div>`;
    const json = JSON.stringify(cfg);
    if (!this._msgCard || this._msgJson !== json) {
      this._msgCard = this._helpers.createCardElement(cfg);
      this._msgJson = json;
    }
    if (this.hass) this._msgCard.hass = this.hass;
    return html`<div class="msg-wrap">${this._msgCard}</div>`;
  }

  static styles = [
    tedStyleTheme,
    modalStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }
      .vision-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--ted-style-surface, var(--ha-card-background));
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .vision-head {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px 8px;
      }
      .vision-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        font-weight: 600;
      }
      .vision-filter {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .filter-actions {
        margin-left: auto;
        display: flex;
        gap: 2px;
      }
      .filter-act {
        --ha-icon-button-size: 32px;
        --mdc-icon-size: 20px;
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
      .filter-act:hover {
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .chip {
        font: inherit;
        font-size: 0.75rem;
        padding: 3px 10px;
        border-radius: 999px;
        cursor: pointer;
        color: var(--ted-style-muted, var(--secondary-text-color));
        background: var(--ted-style-surface-2, rgba(120, 120, 120, 0.12));
        border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
      }
      .chip.on {
        color: #fff;
        background: var(--chip, var(--ted-style-accent, var(--primary-color)));
        border-color: transparent;
      }
      .vision-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 4px 8px 10px;
        gap: 6px;
      }
      .row {
        display: flex;
        gap: 12px;
        align-items: center;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
        background: var(--ted-style-surface-2, rgba(120, 120, 120, 0.08));
        border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.16));
        border-radius: var(--ted-style-radius, 12px);
        padding: 8px;
      }
      .row.reviewed {
        opacity: 0.6;
      }
      .thumb {
        position: relative;
        flex: 0 0 auto;
        width: 92px;
        height: 60px;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 0 0 2px var(--sev, transparent);
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .thumb .play {
        position: absolute;
        color: #fff;
        --mdc-icon-size: 28px;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
      }
      .info {
        min-width: 0;
        flex: 1;
      }
      .line1 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }
      .badge {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #fff;
        background: var(--sev, var(--primary-color));
        border-radius: 999px;
        padding: 1px 8px;
      }
      .fa-tag {
        font-size: 0.62rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--sev, var(--info-color, #4285f4));
        border: 1px solid var(--sev, var(--info-color, #4285f4));
        border-radius: 999px;
        padding: 0 6px;
        flex: 0 0 auto;
      }
      .analyzing-tag {
        font-size: 0.62rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--ted-style-accent, var(--primary-color));
        border: 1px solid var(--ted-style-accent, var(--primary-color));
        border-radius: 999px;
        padding: 0 6px;
        flex: 0 0 auto;
        animation: ted-vision-pulse 1.2s ease-in-out infinite;
      }
      @keyframes ted-vision-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .analyzing-tag {
          animation: none;
        }
      }
      .cam {
        font-weight: 600;
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .time {
        margin-left: auto;
        font-size: 0.72rem;
        color: var(--ted-style-muted, var(--secondary-text-color));
        flex: 0 0 auto;
      }
      .summary {
        font-size: 0.82rem;
        color: var(--ted-style-muted, var(--secondary-text-color));
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .msg-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .msg-wrap > * {
        width: min(520px, 100%);
      }
      .vision-detail .media {
        width: 100%;
        border-radius: 10px;
        background: #000;
        max-height: 50vh;
        object-fit: contain;
      }
      .vision-detail .meta {
        font-size: 0.76rem;
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
      .vision-detail .long {
        font-size: 0.9rem;
        line-height: 1.4;
      }
      .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }
      .ted-btn {
        font: inherit;
        cursor: pointer;
        padding: 8px 14px;
        border-radius: var(--ted-style-radius-sm, 8px);
        border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
        background: var(--ted-style-surface-2, rgba(120, 120, 120, 0.1));
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .ted-btn.primary {
        background: var(--ted-style-accent, var(--primary-color));
        color: #fff;
        border-color: transparent;
      }
      .ted-btn.danger {
        color: var(--error-color, #db4437);
        border-color: var(--error-color, #db4437);
      }
    `,
  ];
}
