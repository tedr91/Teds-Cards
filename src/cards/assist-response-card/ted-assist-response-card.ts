import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { cssColor } from "../../shared/appearance";
import { resolveIcon } from "../../shared/icons";
import { renderAssistSurface, assistSurfaceStyles } from "../../shared/assist-surface";
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
  @state() private _answer?: AssistResponse;
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
    if (!changed.has("hass")) return;
    settingsStore.setHass(this.hass as never);
    this._ensureSub();
    // Restore the current answer from the sensor until a live push takes over.
    if (!this._answer) {
      const stored = this._readSensorAnswer();
      if (stored) this._answer = stored;
    }
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
    this._answer = item;
  }

  /** The current answer for THIS device from the sensor (device → area → house). */
  private _readSensorAnswer(): AssistResponse | undefined {
    const attrs = (this.hass?.states?.[ASSIST_RESPONSES_SENSOR]?.attributes ?? {}) as {
      responses?: Record<string, AssistResponse>;
    };
    const map = attrs.responses;
    if (!map) return undefined;
    const myArea = resolveDeviceArea(this.hass).area;
    const candidates = [
      map[`device:${resolveDeviceId()}`],
      myArea ? map[`area:${myArea}`] : undefined,
      map.house,
    ].filter((x): x is AssistResponse => !!x?.message);
    if (!candidates.length) return undefined;
    // Freshest wins (ISO timestamps sort lexically).
    candidates.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
    return candidates[0];
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const cfg = this._config;
    const themeClass = tedCardThemeClass(cfg.theme ?? "ted-style");

    const hasAnswer = !!this._answer?.message;
    const title = (this._answer?.title ?? cfg.title ?? "Assist") || "";
    const message = hasAnswer
      ? this._answer!.message
      : cfg.placeholder ?? "Waiting for a response…";
    // Per-response image renders INLINE (VA infopic style); background_image is the
    // static backdrop behind the frosted box.
    const answerImage = this._answer?.image || undefined;
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
        ${renderAssistSurface({
          message,
          title,
          image: answerImage,
          icon,
          wide: this._wide,
          placeholder: !hasAnswer,
          themeClass,
          shadow: cfg.shadow !== false,
          boxVars,
        })}
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
    `,
  ];
}
