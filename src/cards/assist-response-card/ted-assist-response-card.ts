import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { cssColor } from "../../shared/appearance";
import { resolveIcon } from "../../shared/icons";
import { assistSurfaceStyles } from "../../shared/assist-surface";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { SettingsController, settingsStore } from "../../shared/settings";
import { announcementTargetsDevice, resolveDeviceArea } from "../../shared/device-area";
import { resolveDeviceId } from "../../shared/device-id";
import {
  ASSIST_RESPONSES_SENSOR,
  ASSIST_RESPONSE_CARD_EDITOR_TYPE,
  ASSIST_RESPONSE_CARD_TYPE,
  SUBSCRIBE_ASSIST_RESPONSES,
} from "./const";
import type { AssistResponse, AssistResponseCardConfig } from "./types";

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

/**
 * Assist-Response card — the visual counterpart to a spoken Assist answer.
 *
 * A voice intent or automation calls the `teds_dashboard_system.assist_response`
 * service with a title + message (+ optional image), targeting areas/devices. The
 * backend pushes it over the `subscribe_assist_responses` stream and (unless the
 * caller opts out) navigates the targeted screens here. This card renders whatever
 * answer was last pushed to THIS device — no auto-revert (the content stays until
 * replaced). On mount it restores the current answer from `sensor.teds_assist_responses`
 * so a reloaded / freshly-navigated screen shows the latest content immediately.
 */
@customElement(ASSIST_RESPONSE_CARD_TYPE)
export class TedAssistResponseCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-assist-response-card-editor");
    return document.createElement(ASSIST_RESPONSE_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<AssistResponseCardConfig> {
    return { fill: true };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AssistResponseCardConfig;
  /** The conversation so far (oldest → newest), shown as a scroll-back thread. */
  @state() private _history: AssistResponse[] = [];
  /** True when the card is wider than it is tall (landscape) — drives image placement. */
  @state() private _wide = true;

  private _sub?: Promise<() => void>;
  private _ro?: ResizeObserver;

  public constructor() {
    super();
    // Keep the shared settings store fed (for effective() / reactivity).
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: AssistResponseCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): GridOptions {
    return { columns: "full", rows: this._fill() ? "auto" : 4, min_rows: 3 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._ensureSub();
    this._ro = new ResizeObserver(() => this._measure());
    this._ro.observe(this);
    this._measure();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._sub?.then((unsub) => unsub()).catch(() => undefined);
    this._sub = undefined;
    this._ro?.disconnect();
    this._ro = undefined;
  }

  /** Landscape (wide) → image beside the text; portrait/narrow → image above it. */
  private _measure(): void {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    const wide = w >= h;
    if (wide !== this._wide) this._wide = wide;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      settingsStore.setHass(this.hass as never);
      this._ensureSub();
      // Restore the conversation from the sensor until live pushes take over.
      if (!this._history.length) {
        const stored = this._readSensorHistory();
        if (stored.length) {
          this._history = stored;
        }
      }
    }
    // Keep the newest turn in view as the conversation grows.
    const thread = this.renderRoot?.querySelector?.(".ar-thread") as HTMLElement | null;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  private _fill(): boolean {
    return this._config?.fill !== false;
  }

  /** Subscribe once `hass.connection` is available (kiosk-safe non-admin command). */
  private _ensureSub(): void {
    const conn = this.hass?.connection;
    if (this._sub || !conn) return;
    this._sub = conn.subscribeMessage<AssistResponse>(
      (item) => this._onEvent(item),
      { type: SUBSCRIBE_ASSIST_RESPONSES },
    );
  }

  private _onEvent(item: AssistResponse): void {
    if (!item?.message) return;
    if (!announcementTargetsDevice(this.hass, { areas: item.areas, devices: item.devices })) return;
    if (item.id && this._history.some((h) => h.id === item.id)) return;
    this._history = [...this._history, item];
  }

  /** The conversation history for THIS device from the sensor (device + area + house),
   *  merged, de-duped by id, oldest → newest. */
  private _readSensorHistory(): AssistResponse[] {
    const attrs = (this.hass?.states?.[ASSIST_RESPONSES_SENSOR]?.attributes ?? {}) as {
      history?: Record<string, AssistResponse[]>;
    };
    const map = attrs.history;
    if (!map) return [];
    const myArea = resolveDeviceArea(this.hass).area;
    const lists = [
      map[`device:${resolveDeviceId()}`],
      myArea ? map[`area:${myArea}`] : undefined,
      map.house,
    ].filter((x): x is AssistResponse[] => Array.isArray(x));
    const seen = new Set<string>();
    const out: AssistResponse[] = [];
    for (const list of lists) {
      for (const item of list) {
        if (!item?.message) continue;
        const id = item.id ?? `${item.ts ?? ""}:${item.message}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(item);
      }
    }
    out.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
    return out;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const cfg = this._config;
    const themeClass = tedCardThemeClass(cfg.theme ?? "ted-style");
    const entries = this._history;
    const bgImage = cfg.background_image;

    const icon =
      cfg.icon === undefined
        ? resolveIcon({ fluent: "chat-24-regular", mdi: "message-reply-text" }) ??
          "mdi:message-reply-text"
        : cfg.icon;

    const boxVars: Record<string, string> = {};
    if (typeof cfg.transparency === "number") {
      boxVars["--ar-bg-alpha"] = `${Math.max(0, Math.min(100, 100 - cfg.transparency))}%`;
    }
    if (typeof cfg.blur === "number") boxVars["--ar-blur"] = `${cfg.blur}px`;
    if (cfg.accent) boxVars["--ar-accent"] = cssColor(cfg.accent) ?? cfg.accent;

    return html`
      <div class="ar-root${this._fill() ? " fill" : ""}">
        ${bgImage
          ? html`<div
              class="ar-bg"
              style=${styleMap({ backgroundImage: `url("${bgImage}")` })}
            ></div>`
          : nothing}
        <div
          class="ar-box ${themeClass}${cfg.shadow === false ? "" : " ar-shadow"}"
          style=${styleMap(boxVars)}
          role="log"
          aria-live="polite"
        >
          ${icon ? html`<ha-icon class="ar-icon" .icon=${icon}></ha-icon>` : nothing}
          <div class="ar-content ar-thread">
            ${entries.length
              ? entries.map((e, i) => this._renderEntry(e, i === entries.length - 1))
              : html`<div class="ar-message placeholder">
                  ${cfg.placeholder ?? "Waiting for a response…"}
                </div>`}
          </div>
        </div>
      </div>
    `;
  }

  /** One conversation entry: the (optional) recognized question + the answer. The
   *  latest entry is emphasized; older ones are dimmed for scroll-back context. */
  private _renderEntry(e: AssistResponse, latest: boolean): TemplateResult {
    const image = e.image || undefined;
    const bodyClass = image ? (this._wide ? " row" : " col") : "";
    return html`
      <div class="arh-entry${latest ? " latest" : ""}">
        ${e.question
          ? html`<div class="arh-q"><span class="arh-role">You</span><span>${e.question}</span></div>`
          : nothing}
        ${e.title ? html`<div class="arh-title">${e.title}</div>` : nothing}
        <div class="arh-a${bodyClass}">
          ${image ? html`<img class="ar-image" src=${image} alt="" />` : nothing}
          <div class="ar-message">${e.message}</div>
        </div>
      </div>
    `;
  }

  static styles = [
    tedStyleTheme,
    assistSurfaceStyles,
    css`
      :host {
        display: block;
        height: 100%;
      }
      .ar-root {
        position: relative;
        display: flex;
        box-sizing: border-box;
        min-height: 160px;
      }
      .ar-root.fill {
        height: 100%;
      }
      .ar-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
      }
      /* The box clips; the thread inside it scrolls (conversation scroll-back). */
      .ar-box {
        overflow: hidden;
        min-height: 0;
      }
      .ar-thread {
        gap: clamp(16px, 2.4vw, 26px);
        align-self: stretch;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .arh-entry {
        display: flex;
        flex-direction: column;
        gap: 6px;
        opacity: 0.66;
        transition: opacity 0.2s ease;
      }
      .arh-entry.latest {
        opacity: 1;
      }
      .arh-q {
        display: flex;
        gap: 8px;
        align-items: baseline;
        font-size: calc(var(--ar-msg-size) * 0.62);
        color: var(--ted-style-muted);
        overflow-wrap: anywhere;
      }
      .arh-role {
        flex: 0 0 auto;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ar-accent);
      }
      .arh-title {
        font-size: calc(var(--ar-msg-size) * 0.7);
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ted-style-text);
      }
      .arh-a {
        display: flex;
        min-width: 0;
      }
      .arh-a.row {
        flex-direction: row;
        align-items: flex-start;
        gap: clamp(16px, 2.4vw, 28px);
      }
      .arh-a.col {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
      .arh-entry .ar-message {
        font-size: calc(var(--ar-msg-size) * 0.74);
        flex: 1 1 auto;
      }
      .arh-entry.latest .ar-message {
        font-size: var(--ar-msg-size);
        font-weight: 600;
      }
      .arh-a.row .ar-image {
        max-width: 42%;
        max-height: 40vh;
      }
      .arh-a.col .ar-image {
        max-width: 100%;
        max-height: 40vh;
      }
    `,
  ];
}
