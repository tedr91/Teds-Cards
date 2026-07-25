import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle } from "../../shared/appearance";
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
 * A voice intent or automation calls the `teds_cards_backend.assist_response`
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

  private _sub?: Promise<() => void>;

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
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._sub?.then((unsub) => unsub()).catch(() => undefined);
    this._sub = undefined;
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
    const style = appearanceStyle({
      background: cfg.background,
      transparency: cfg.transparency,
      blur: cfg.blur,
    });

    const hasAnswer = !!this._answer?.message;
    const title = (this._answer?.title ?? cfg.title ?? "Assist") || "";
    const message = hasAnswer
      ? this._answer!.message
      : cfg.placeholder ?? "Waiting for a response…";
    const image = this._answer?.image || cfg.background_image;

    return html`
      <ha-card
        class="ted-card ${themeClass}${this._fill() ? " fill" : ""}"
        style=${styleMap(style)}
      >
        ${image
          ? html`<div
              class="ar-bg"
              style=${styleMap({ backgroundImage: `url("${image}")` })}
            ></div>`
          : nothing}
        <div class="ar-inner">
          ${title ? html`<div class="ar-title">${title}</div>` : nothing}
          <div class="ar-message ${hasAnswer ? "" : "placeholder"}">${message}</div>
        </div>
      </ha-card>
    `;
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
        overflow: hidden;
        display: flex;
        flex-direction: column;
        color: var(--ted-style-text);
        background: var(--ted-style-surface);
        border-radius: var(--ted-style-radius);
        min-height: 160px;
      }
      ha-card.fill {
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
      .ar-inner {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-rows: min-content 1fr;
        gap: 12px;
        flex: 1;
        min-height: 0;
        padding: clamp(16px, 3vw, 40px);
      }
      .ar-title {
        font-size: clamp(18px, 2.4vw, 34px);
        font-weight: 600;
        line-height: 1.15;
        color: var(--ted-style-text);
      }
      .ar-message {
        align-self: center;
        font-size: clamp(20px, 3.4vw, 52px);
        line-height: 1.3;
        font-weight: 500;
        text-wrap: balance;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        color: var(--ted-style-text);
      }
      .ar-message.placeholder {
        color: var(--ted-style-muted);
        font-weight: 400;
      }
    `,
  ];
}
