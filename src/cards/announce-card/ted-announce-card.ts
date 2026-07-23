import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { showConfirmation } from "../../shared/dialogs";
import { NotificationToastController } from "../../shared/notifications";
import { SettingsController, settingsStore } from "../../shared/settings";
import { listAreas } from "../../shared/device-area";
import { resolveDeviceId } from "../../shared/device-id";
import type { AnnounceMessage } from "../../shared/settings-schema";
import "../../shared/ted-icon-button";
import {
  ANNOUNCEMENTS_SENSOR,
  ANNOUNCE_CARD_DESCRIPTION,
  ANNOUNCE_CARD_EDITOR_TYPE,
  ANNOUNCE_CARD_NAME,
  ANNOUNCE_CARD_TYPE,
  ANNOUNCE_DOMAIN,
} from "./const";
import type { AnnounceCardConfig, RecentAnnouncement } from "./types";

/** Subset of Home Assistant's LovelaceGridOptions. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

registerCustomCard({
  type: ANNOUNCE_CARD_TYPE,
  name: ANNOUNCE_CARD_NAME,
  description: ANNOUNCE_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#announce-card",
});

@customElement(ANNOUNCE_CARD_TYPE)
export class TedAnnounceCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-announce-card-editor");
    return document.createElement(ANNOUNCE_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<AnnounceCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AnnounceCardConfig;

  /** The message that will be spoken (a picked preset's text, or free text). */
  @state() private _message = "";
  /** Selected preset id (null = custom text). */
  @state() private _presetId: string | null = null;
  /** Title/icon carried from a selected preset (used for the notification). */
  @state() private _presetLabel = "";
  @state() private _presetIcon = "";
  /** Selected target area ids and device ids (both empty = house-wide). */
  @state() private _targetAreas: string[] = [];
  @state() private _targetDevices: string[] = [];
  /** Persist until dismissed (vs one-shot with a timeout). */
  @state() private _persistent = false;
  /** Repeat the alert chime after speech (persistent only); null = use the default. */
  @state() private _repeatSound: boolean | null = null;

  public constructor() {
    super();
    // Feed the settings store (presets + device registry) and pop announcement toasts here.
    new SettingsController(this, () => this.hass);
    new NotificationToastController(this, () => ({ hass: this.hass }));
  }

  public setConfig(config: AnnounceCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions(): GridOptions {
    return { columns: "full", rows: "auto", min_columns: 6, min_rows: 4 };
  }

  private _presets(): AnnounceMessage[] {
    const v = settingsStore.effective().announce_messages;
    const list = Array.isArray(v) ? (v as unknown as AnnounceMessage[]) : [];
    // Only ready-to-send presets (those with spoken text); blank draft rows in
    // Settings are skipped so they don't show as empty chips.
    return list.filter((m) => (m.text || "").trim());
  }

  private get _recent(): RecentAnnouncement[] {
    const v = this.hass?.states[ANNOUNCEMENTS_SENSOR]?.attributes.recent;
    return Array.isArray(v) ? (v as RecentAnnouncement[]) : [];
  }

  /** Effective "repeat the chime" value (state override, else the global default). */
  private _repeat(): boolean {
    if (this._repeatSound !== null) return this._repeatSound;
    return settingsStore.effective().announce_repeat_default !== false;
  }

  private _timeoutDefault(): number {
    const raw = Number(settingsStore.effective().announce_timeout_default);
    return Number.isFinite(raw) && raw >= 0 ? raw : 30;
  }

  private _areaName(id: string): string {
    const areas = (this.hass as { areas?: Record<string, { name?: string }> } | undefined)?.areas;
    return areas?.[id]?.name ?? id;
  }

  private _deviceName(id: string, entry: { name?: string }): string {
    return entry.name?.trim() || id.replace(/^bm:|^id:/, "");
  }

  // --- composer interactions ---------------------------------------------
  private _selectPreset(m: AnnounceMessage): void {
    if (this._presetId === m.id) {
      // Toggle off → back to a blank custom message.
      this._presetId = null;
      this._message = "";
      this._presetLabel = "";
      this._presetIcon = "";
      return;
    }
    this._presetId = m.id;
    this._message = m.text ?? "";
    this._presetLabel = m.label ?? "";
    this._presetIcon = m.icon ?? "";
  }

  private _onMessageInput(ev: Event): void {
    this._message = (ev.target as HTMLTextAreaElement).value;
    // Editing the text turns it into a custom message.
    this._presetId = null;
    this._presetLabel = "";
    this._presetIcon = "";
  }

  private _toggleArea(id: string): void {
    this._targetAreas = this._targetAreas.includes(id)
      ? this._targetAreas.filter((a) => a !== id)
      : [...this._targetAreas, id];
  }

  private _toggleDevice(id: string): void {
    this._targetDevices = this._targetDevices.includes(id)
      ? this._targetDevices.filter((d) => d !== id)
      : [...this._targetDevices, id];
  }

  private _send(): void {
    const message = this._message.trim();
    if (!message || !this.hass) return;
    const persistent = this._persistent;
    const data: Record<string, unknown> = {
      message,
      title: this._presetLabel || "Announcement",
      areas: this._targetAreas,
      devices: this._targetDevices,
      persistent,
      repeat_sound: persistent && this._repeat(),
      timeout: this._timeoutDefault(),
      source_device: resolveDeviceId(),
    };
    if (this._presetIcon) data.icon = this._presetIcon;
    this.hass.callService(ANNOUNCE_DOMAIN, "announce", data);
  }

  // --- recent interactions -----------------------------------------------
  private _resend(r: RecentAnnouncement): void {
    if (!this.hass) return;
    const data: Record<string, unknown> = {
      message: r.message,
      title: r.title || "Announcement",
      areas: r.areas ?? [],
      devices: r.devices ?? [],
      persistent: !!r.persistent,
      repeat_sound: !!r.persistent && !!r.repeat_sound,
      timeout: this._timeoutDefault(),
      source_device: resolveDeviceId(),
    };
    if (r.icon) data.icon = r.icon;
    this.hass.callService(ANNOUNCE_DOMAIN, "announce", data);
  }

  private _loadRecent(r: RecentAnnouncement): void {
    this._message = r.message ?? "";
    this._presetId = null;
    this._presetLabel = r.title && r.title !== "Announcement" ? r.title : "";
    this._presetIcon = r.icon ?? "";
    this._targetAreas = [...(r.areas ?? [])];
    this._targetDevices = [...(r.devices ?? [])];
    this._persistent = !!r.persistent;
    this._repeatSound = !!r.repeat_sound;
  }

  private async _removeRecent(r: RecentAnnouncement): Promise<void> {
    const ok = await showConfirmation(this, {
      title: "Remove announcement",
      text: `Remove "${r.title || r.message}" from Recent?`,
      confirmText: "Remove",
      destructive: true,
    });
    if (ok) this.hass?.callService(ANNOUNCE_DOMAIN, "remove_announcement", { id: r.id });
  }

  private _openSettings(): void {
    const path = this._config?.settings_path ?? "[root]/settings?tab=announce";
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    let target = path.replace("[root]", root);
    if (target && !target.startsWith("/")) target = `/${target}`;
    history.pushState(null, "", target);
    window.dispatchEvent(new Event("location-changed"));
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;

    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const shadow = cfg.shadow !== false;
    const brushed = cfg.brushed === true;
    const missing = !this.hass.states[ANNOUNCEMENTS_SENSOR];
    const showIcon = cfg.show_header_icon !== false;
    const showName = cfg.show_header_name !== false;
    const iconScale = typeof cfg.header_icon_size === "number" ? cfg.header_icon_size : 100;
    const nameScale = typeof cfg.header_name_size === "number" ? cfg.header_name_size : 100;
    const scale = typeof cfg.scale === "number" ? cfg.scale : 100;
    const headerDivider = cfg.header_divider === true;

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

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${brushed ? brushedOverlay : nothing}
        <div class="head ${headerDivider ? "with-divider" : ""}">
          ${showIcon
            ? html`<ha-icon
                icon="mdi:bullhorn"
                style=${styleMap({ "--mdc-icon-size": `calc(22px * ${iconScale / 100})` })}
              ></ha-icon>`
            : nothing}
          ${showName
            ? html`<span style=${styleMap({ fontSize: `calc(1.05rem * ${nameScale / 100})` })}
                >${cfg.title ?? "Announce"}</span
              >`
            : nothing}
          ${!missing
            ? html`<ted-icon-button
                class="cog-hdr"
                icon="mdi:cog-outline"
                label="Manage messages"
                @click=${this._openSettings}
              ></ted-icon-button>`
            : nothing}
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to send announcements.</div>`
          : this._renderBody()}
      </ha-card>
    `;
  }

  private _renderBody(): TemplateResult {
    return html`
      <div class="body">
        ${this._renderMessage()} ${this._renderTargets()} ${this._renderWhen()}
        <div class="send-row">
          <button class="send-btn" ?disabled=${!this._message.trim()} @click=${this._send}>
            <ha-icon icon="mdi:send"></ha-icon> Announce
          </button>
        </div>
        ${this._renderRecent()}
      </div>
    `;
  }

  private _renderMessage(): TemplateResult {
    const presets = this._presets();
    return html`
      <section class="sec">
        <div class="sec-title">Message</div>
        ${presets.length
          ? html`<div class="chips">
              ${presets.map(
                (m) => html`<button
                  class="chip ${this._presetId === m.id ? "on" : ""}"
                  @click=${() => this._selectPreset(m)}
                >
                  <ha-icon .icon=${m.icon || "mdi:bullhorn"}></ha-icon>${m.label || m.text}
                </button>`,
              )}
            </div>`
          : html`<div class="hint">
              No predefined messages yet.
              <button class="link-inline" @click=${this._openSettings}>Add some in Settings</button>.
            </div>`}
        <textarea
          class="msg-input"
          rows="2"
          placeholder="Type a custom announcement…"
          .value=${this._message}
          @input=${this._onMessageInput}
        ></textarea>
      </section>
    `;
  }

  private _renderTargets(): TemplateResult {
    const areas = listAreas(this.hass);
    const devices = Object.entries(settingsStore.registry());
    const houseWide = !this._targetAreas.length && !this._targetDevices.length;
    return html`
      <section class="sec">
        <div class="sec-title">
          Send to
          ${houseWide ? html`<span class="sec-note">All devices (house-wide)</span>` : nothing}
        </div>
        ${areas.length
          ? html`<div class="chips">
              ${areas.map(
                (a) => html`<button
                  class="chip ${this._targetAreas.includes(a.id) ? "on" : ""}"
                  @click=${() => this._toggleArea(a.id)}
                >
                  <ha-icon icon="mdi:map-marker-outline"></ha-icon>${a.name}
                </button>`,
              )}
            </div>`
          : nothing}
        ${devices.length
          ? html`<div class="chips">
              ${devices.map(
                ([id, entry]) => html`<button
                  class="chip ${this._targetDevices.includes(id) ? "on" : ""}"
                  @click=${() => this._toggleDevice(id)}
                >
                  <ha-icon icon="mdi:tablet-dashboard"></ha-icon>${this._deviceName(id, entry)}
                </button>`,
              )}
            </div>`
          : html`<div class="hint">No Ted's Dashboard devices have registered yet.</div>`}
      </section>
    `;
  }

  private _renderWhen(): TemplateResult {
    return html`
      <section class="sec">
        <div class="sec-title">When</div>
        <div class="seg">
          <button class="segbtn ${this._persistent ? "" : "on"}" @click=${() => (this._persistent = false)}>
            Play once
          </button>
          <button class="segbtn ${this._persistent ? "on" : ""}" @click=${() => (this._persistent = true)}>
            Until dismissed
          </button>
        </div>
        ${this._persistent
          ? html`<label class="toggle-row">
              <input
                type="checkbox"
                .checked=${this._repeat()}
                @change=${(e: Event) => (this._repeatSound = (e.target as HTMLInputElement).checked)}
              />
              <span>Repeat an alert sound after the announcement</span>
            </label>`
          : nothing}
      </section>
    `;
  }

  private _renderRecent(): TemplateResult | typeof nothing {
    const recent = this._recent;
    if (!recent.length) return nothing;
    return html`
      <section class="sec">
        <div class="sec-title">Recent</div>
        <div class="recent-list">
          ${repeat(
            recent,
            (r) => r.id,
            (r) => this._renderRecentRow(r),
          )}
        </div>
      </section>
    `;
  }

  private _renderRecentRow(r: RecentAnnouncement): TemplateResult {
    const scope = this._targetSummary(r);
    return html`
      <div class="recent-row">
        <button class="recent-main" title="Load into composer" @click=${() => this._loadRecent(r)}>
          <ha-icon class="recent-ico" .icon=${r.icon || "mdi:bullhorn"}></ha-icon>
          <span class="recent-text">
            <span class="recent-label">${r.title && r.title !== "Announcement" ? r.title : r.message}</span>
            <span class="recent-sub">${scope}${r.persistent ? " · until dismissed" : ""}</span>
          </span>
        </button>
        <ted-icon-button
          class="recent-act"
          icon="mdi:send"
          label="Send again"
          @click=${() => this._resend(r)}
        ></ted-icon-button>
        <ted-icon-button
          class="recent-act"
          icon="mdi:delete-outline"
          label="Remove"
          @click=${() => this._removeRecent(r)}
        ></ted-icon-button>
      </div>
    `;
  }

  /** Short "to Kitchen, +1" style target summary for a recent row. */
  private _targetSummary(r: RecentAnnouncement): string {
    const names = [
      ...(r.areas ?? []).map((a) => this._areaName(a)),
      ...(r.devices ?? []).map((d) => this._deviceName(d, settingsStore.registry()[d] ?? {})),
    ];
    if (!names.length) return "All devices";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
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
      .head ha-icon {
        color: var(--ted-style-text);
        --mdc-icon-size: 22px;
      }
      .cog-hdr {
        margin-left: auto;
        --ted-ib-color: var(--ted-style-muted);
        flex: none;
      }
      .warn {
        padding: 8px 16px 16px;
        color: var(--ted-style-muted);
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: 14px;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 6px 16px 4px;
      }
      .sec {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sec-title {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-weight: 600;
        font-size: 0.82rem;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--ted-style-muted);
      }
      .sec-note {
        text-transform: none;
        letter-spacing: 0;
        font-weight: 400;
        font-size: 0.8rem;
        color: var(--ted-style-muted);
      }
      .hint {
        font-size: 0.85rem;
        color: var(--ted-style-muted);
      }
      .link-inline {
        display: inline;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        color: var(--ted-style-accent, var(--primary-color));
        text-decoration: underline;
        cursor: pointer;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid var(--ted-style-divider);
        background: color-mix(in srgb, var(--ted-style-text) 6%, transparent);
        color: var(--ted-style-text);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chip ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        color: var(--ted-style-muted);
      }
      .chip:hover {
        border-color: var(--ted-style-accent, var(--primary-color));
      }
      .chip.on {
        border-color: var(--ted-style-accent, var(--primary-color));
        background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color)) 22%, transparent);
      }
      .chip.on ha-icon {
        color: var(--ted-style-accent, var(--primary-color));
      }
      .msg-input {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 44px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--ted-style-divider);
        background: color-mix(in srgb, var(--ted-style-text) 5%, transparent);
        color: var(--ted-style-text);
        font: inherit;
        font-size: 0.95rem;
      }
      .msg-input:focus {
        outline: none;
        border-color: var(--ted-style-accent, var(--primary-color));
      }
      .seg {
        display: inline-flex;
        gap: 4px;
        padding: 3px;
        border-radius: 10px;
        border: 1px solid var(--ted-style-divider);
        align-self: flex-start;
      }
      .segbtn {
        padding: 6px 14px;
        border-radius: 8px;
        border: none;
        background: none;
        color: var(--ted-style-muted);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
      }
      .segbtn.on {
        background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color)) 24%, transparent);
        color: var(--ted-style-text);
      }
      .toggle-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.9rem;
        color: var(--ted-style-text);
        cursor: pointer;
      }
      .toggle-row input {
        width: 18px;
        height: 18px;
        accent-color: var(--ted-style-accent, var(--primary-color));
      }
      .send-row {
        display: flex;
        justify-content: flex-end;
      }
      .send-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 10px;
        border: none;
        background: var(--ted-style-accent, var(--primary-color));
        color: #fff;
        font: inherit;
        font-weight: 600;
        font-size: 0.95rem;
        cursor: pointer;
      }
      .send-btn ha-icon {
        --mdc-icon-size: 20px;
      }
      .send-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .recent-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .recent-row {
        display: flex;
        align-items: center;
        gap: 4px;
        border-top: 1px solid var(--ted-style-divider);
        padding: 4px 0;
      }
      .recent-main {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1 1 auto;
        min-width: 0;
        padding: 6px 4px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        border-radius: 8px;
      }
      .recent-main:hover {
        background: color-mix(in srgb, var(--ted-style-text) 6%, transparent);
      }
      .recent-ico {
        --mdc-icon-size: 22px;
        color: var(--ted-style-muted);
        flex: none;
      }
      .recent-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .recent-label {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .recent-sub {
        font-size: 0.78rem;
        color: var(--ted-style-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .recent-act {
        --ted-ib-color: var(--ted-style-muted);
        flex: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    [ANNOUNCE_CARD_TYPE]: TedAnnounceCard;
  }
}
