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
import type { AnnounceMessage, SettingsValue } from "../../shared/settings-schema";
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
  /** True when the user chose "Custom…" and is typing their own message. */
  @state() private _customMode = false;
  /** Selected target area ids and device ids (both empty = Everyone/house-wide). */
  @state() private _targetAreas: string[] = [];
  @state() private _targetDevices: string[] = [];
  /** Play once (default) vs repeat the alert sound until dismissed/timeout. */
  @state() private _persistent = false;
  /** Which dropdown is open (message / targets), or none. */
  @state() private _openMenu: "message" | "targets" | null = null;
  /** Briefly true right after sending, to show "Sent ✓" on the button. */
  @state() private _justSent = false;
  private _sentTimer?: number;

  public constructor() {
    super();
    // Feed the settings store (presets + device registry) and pop announcement toasts here.
    new SettingsController(this, () => this.hass);
    new NotificationToastController(this, () => ({ hass: this.hass }));
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this._onDocPointerDown, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("pointerdown", this._onDocPointerDown, true);
    if (this._sentTimer) window.clearTimeout(this._sentTimer);
  }

  /** Close an open dropdown when the user taps outside of any picker. */
  private _onDocPointerDown = (ev: Event): void => {
    if (!this._openMenu) return;
    const inMenu = ev
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.classList?.contains("picker-wrap"));
    if (!inMenu) this._openMenu = null;
  };

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

  // --- helpers -----------------------------------------------------------
  private _registry(): Record<string, { name?: string; area?: string; last_seen?: string }> {
    return settingsStore.registry();
  }

  private _online(entry: { last_seen?: string }): boolean {
    const t = entry.last_seen ? Date.parse(entry.last_seen) : NaN;
    return Number.isFinite(t) && Date.now() - t < 15 * 60 * 1000;
  }

  private _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  /** "Kitchen", "Kitchen +2", or "Everyone" for a set of area/device targets. */
  private _summaryOf(areas: string[], devices: string[]): string {
    const reg = this._registry();
    const names = [
      ...areas.map((a) => this._areaName(a)),
      ...devices.map((d) => this._deviceName(d, reg[d] ?? {})),
    ];
    if (!names.length) return "Everyone";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  /** The label shown on the "Say" picker. */
  private _messageSummary(): string {
    if (this._presetId) return this._presetLabel || this._message || "Message";
    const t = this._message.trim();
    if (this._customMode) return t || "Custom message…";
    return t || "Choose a message…";
  }

  /** Relative time like "just now" / "5m ago" / "2h ago" / "yesterday". */
  private _relTime(iso?: string): string {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 172800) return "yesterday";
    return new Date(t).toLocaleDateString();
  }

  // --- composer interactions ---------------------------------------------
  private _toggleMenu(which: "message" | "targets"): void {
    this._openMenu = this._openMenu === which ? null : which;
  }

  private _pickPreset(m: AnnounceMessage): void {
    this._presetId = m.id;
    this._message = m.text ?? "";
    this._presetLabel = m.label ?? "";
    this._presetIcon = m.icon ?? "";
    this._customMode = false;
    this._openMenu = null;
  }

  private _pickCustom(): void {
    this._presetId = null;
    this._presetLabel = "";
    this._presetIcon = "";
    this._customMode = true;
    this._openMenu = null;
    this.updateComplete.then(() => {
      (this.renderRoot.querySelector(".custom-input") as HTMLTextAreaElement | null)?.focus();
    });
  }

  private _onCustomInput(ev: Event): void {
    this._message = (ev.target as HTMLTextAreaElement).value;
    this._presetId = null;
    this._presetLabel = "";
    this._presetIcon = "";
  }

  private _pickEveryone(): void {
    this._targetAreas = [];
    this._targetDevices = [];
    this._openMenu = null;
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

  private _flashSent(): void {
    this._justSent = true;
    if (this._sentTimer) window.clearTimeout(this._sentTimer);
    this._sentTimer = window.setTimeout(() => (this._justSent = false), 1800);
  }

  private _send(): void {
    const message = this._message.trim();
    if (!message || !this.hass) return;
    const data: Record<string, unknown> = {
      message,
      title: this._presetLabel || "Announcement",
      areas: this._targetAreas,
      devices: this._targetDevices,
      persistent: this._persistent,
      timeout: this._timeoutDefault(),
      source_device: resolveDeviceId(),
    };
    if (this._presetIcon) data.icon = this._presetIcon;
    this.hass.callService(ANNOUNCE_DOMAIN, "announce", data);
    this._openMenu = null;
    this._flashSent();
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
      timeout: this._timeoutDefault(),
      source_device: resolveDeviceId(),
    };
    if (r.icon) data.icon = r.icon;
    this.hass.callService(ANNOUNCE_DOMAIN, "announce", data);
    this._flashSent();
  }

  private _loadRecent(r: RecentAnnouncement): void {
    this._message = r.message ?? "";
    this._presetId = null;
    this._presetLabel = r.title && r.title !== "Announcement" ? r.title : "";
    this._presetIcon = r.icon ?? "";
    this._customMode = !this._presetLabel;
    this._targetAreas = [...(r.areas ?? [])];
    this._targetDevices = [...(r.devices ?? [])];
    this._persistent = !!r.persistent;
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

  /** Save a recent announcement as a reusable predefined message (admin only). */
  private _saveAsPreset(r: RecentAnnouncement): void {
    if (!this._isAdmin()) return;
    const text = (r.message ?? "").trim();
    if (!text) return;
    const raw = settingsStore.effective().announce_messages;
    const list = Array.isArray(raw) ? (raw as unknown as AnnounceMessage[]) : [];
    if (list.some((m) => (m.text ?? "").trim() === text)) return; // already saved
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now().toString(36)}`;
    const label = ((r.title && r.title !== "Announcement" ? r.title : text) || "").slice(0, 40);
    const msg: AnnounceMessage = { id, label, text, ...(r.icon ? { icon: r.icon } : {}) };
    settingsStore.setValue("global", "announce_messages", [...list, msg] as unknown as SettingsValue);
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
    const hasRecent = this._recent.length > 0;
    return html`
      <div class="d-layout ${hasRecent ? "has-recent" : ""}">
        <div class="compose">${this._renderForm()}</div>
        ${hasRecent
          ? html`
              <div class="recent-side">
                <div class="sec-label">Recent</div>
                ${this._renderRecentList()}
              </div>
              <div class="recent-below">
                <details class="rec-details">
                  <summary>
                    <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
                    Recent<span class="rec-count">${this._recent.length}</span>
                  </summary>
                  ${this._renderRecentList()}
                </details>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderForm(): TemplateResult {
    const armed = !!this._message.trim();
    const msgPlaceholder = !this._presetId && !this._message.trim();
    const summary = this._summaryOf(this._targetAreas, this._targetDevices);
    return html`
      <div class="panel form">
        <div class="frow">
          <span class="flabel">Say</span>
          <div class="picker-wrap">
            <button
              class="picker ${this._openMenu === "message" ? "open" : ""} ${msgPlaceholder ? "placeholder" : ""}"
              @click=${() => this._toggleMenu("message")}
            >
              <span class="picker-text">${this._messageSummary()}</span>
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
            ${this._openMenu === "message" ? this._renderMessageMenu() : nothing}
          </div>
        </div>

        ${this._customMode
          ? html`<textarea
              class="custom-input"
              rows="2"
              placeholder="Type a custom announcement…"
              .value=${this._message}
              @input=${this._onCustomInput}
            ></textarea>`
          : nothing}

        <div class="frow">
          <span class="flabel">To</span>
          <div class="picker-wrap">
            <button
              class="picker ${this._openMenu === "targets" ? "open" : ""}"
              @click=${() => this._toggleMenu("targets")}
            >
              <span class="picker-text">${summary}</span>
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
            ${this._openMenu === "targets" ? this._renderTargetMenu() : nothing}
          </div>
        </div>

        <div class="frow">
          <span class="flabel">Mode</span>
          <div class="seg">
            <button class="segbtn ${this._persistent ? "" : "on"}" @click=${() => (this._persistent = false)}>
              Play once
            </button>
            <button class="segbtn ${this._persistent ? "on" : ""}" @click=${() => (this._persistent = true)}>
              Until dismissed
            </button>
          </div>
        </div>
      </div>

      <button class="send-btn ${this._justSent ? "sent" : ""}" ?disabled=${!armed} @click=${this._send}>
        ${this._justSent
          ? html`<ha-icon icon="mdi:check-circle"></ha-icon> Sent`
          : html`<ha-icon icon="mdi:send"></ha-icon> Announce to ${summary}`}
      </button>
    `;
  }

  private _renderMessageMenu(): TemplateResult {
    const presets = this._presets();
    return html`
      <div class="menu" @click=${(e: Event) => e.stopPropagation()}>
        ${presets.length
          ? presets.map(
              (m) => html`<button
                class="menu-item ${this._presetId === m.id ? "on" : ""}"
                @click=${() => this._pickPreset(m)}
              >
                <ha-icon .icon=${m.icon || "mdi:bullhorn"}></ha-icon>
                <span class="mi-text">
                  <span class="mi-label">${m.label || m.text}</span>
                  ${m.label ? html`<span class="mi-sub">${m.text}</span>` : nothing}
                </span>
              </button>`,
            )
          : html`<div class="menu-empty">
              No saved messages.${this._isAdmin()
                ? html` <button class="link-inline" @click=${this._openSettings}>Add some</button>.`
                : nothing}
            </div>`}
        <div class="menu-sep"></div>
        <button class="menu-item ${this._customMode ? "on" : ""}" @click=${this._pickCustom}>
          <ha-icon icon="mdi:pencil-outline"></ha-icon><span class="mi-label">Custom message…</span>
        </button>
      </div>
    `;
  }

  private _renderTargetMenu(): TemplateResult {
    const areas = listAreas(this.hass);
    const reg = this._registry();
    const devices = Object.entries(reg);
    const everyone = !this._targetAreas.length && !this._targetDevices.length;
    return html`
      <div class="menu" @click=${(e: Event) => e.stopPropagation()}>
        <button class="menu-item ${everyone ? "on" : ""}" @click=${this._pickEveryone}>
          <ha-icon icon="mdi:account-group-outline"></ha-icon>
          <span class="mi-label">Everyone</span>
          ${everyone ? html`<ha-icon class="mi-check" icon="mdi:check"></ha-icon>` : nothing}
        </button>
        ${areas.length ? html`<div class="menu-sec">Rooms</div>` : nothing}
        ${areas.map(
          (a) => html`<button
            class="menu-item ${this._targetAreas.includes(a.id) ? "on" : ""}"
            @click=${() => this._toggleArea(a.id)}
          >
            <ha-icon icon="mdi:map-marker-outline"></ha-icon>
            <span class="mi-label">${a.name}</span>
            ${this._targetAreas.includes(a.id) ? html`<ha-icon class="mi-check" icon="mdi:check"></ha-icon>` : nothing}
          </button>`,
        )}
        <div class="menu-sec">Devices</div>
        ${devices.length
          ? devices.map(([id, entry]) => {
              const online = this._online(entry);
              return html`<button
                class="menu-item ${this._targetDevices.includes(id) ? "on" : ""} ${online ? "" : "offline"}"
                @click=${() => this._toggleDevice(id)}
              >
                <span class="dot ${online ? "on" : ""}"></span>
                <span class="mi-label">${this._deviceName(id, entry)}${online ? "" : " · offline"}</span>
                ${this._targetDevices.includes(id)
                  ? html`<ha-icon class="mi-check" icon="mdi:check"></ha-icon>`
                  : nothing}
              </button>`;
            })
          : html`<div class="menu-empty">No devices have registered yet.</div>`}
      </div>
    `;
  }

  private _renderRecentList(): TemplateResult {
    return html`
      <div class="recent-list">
        ${repeat(
          this._recent,
          (r) => r.id,
          (r) => this._renderRecentRow(r),
        )}
      </div>
    `;
  }

  private _renderRecentRow(r: RecentAnnouncement): TemplateResult {
    const scope = this._summaryOf(r.areas ?? [], r.devices ?? []);
    const sender =
      r.source_device_name || (r.source_device ? this._registry()[r.source_device]?.name : "") || "";
    const bits = [scope, this._relTime(r.last_sent), sender ? `from ${sender}` : ""].filter(Boolean);
    return html`
      <div class="recent-row">
        <button class="recent-main" title="Load into composer" @click=${() => this._loadRecent(r)}>
          <ha-icon class="recent-ico" .icon=${r.icon || "mdi:bullhorn"}></ha-icon>
          <span class="recent-text">
            <span class="recent-label">${r.title && r.title !== "Announcement" ? r.title : r.message}</span>
            <span class="recent-sub">${bits.join(" · ")}${r.persistent ? " · until dismissed" : ""}</span>
          </span>
        </button>
        ${this._isAdmin()
          ? html`<ted-icon-button
              class="recent-act"
              icon="mdi:star-outline"
              label="Save as message"
              @click=${() => this._saveAsPreset(r)}
            ></ted-icon-button>`
          : nothing}
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

      /* Option D layout: compose + adaptive Recent (side rail wide / collapsed narrow). */
      .d-layout {
        display: grid;
        grid-template-columns: 1fr;
        flex: 1 1 auto;
        min-height: 0;
      }
      .compose {
        padding: 8px 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
      }
      .recent-side {
        display: none;
      }
      .recent-below {
        grid-column: 1 / -1;
        border-top: 1px solid var(--ted-style-divider);
        padding: 2px 12px 8px;
      }

      .panel.form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 13px;
        border: 1px solid var(--ted-style-divider);
        background: color-mix(in srgb, var(--ted-style-text) 4%, transparent);
      }
      .frow {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .flabel {
        width: 46px;
        flex: none;
        font-size: 0.82rem;
        color: var(--ted-style-muted);
      }
      .picker-wrap {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
      }
      .picker {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: 10px;
        cursor: pointer;
        border: 1px solid var(--ted-style-divider);
        background: color-mix(in srgb, var(--ted-style-text) 6%, transparent);
        color: var(--ted-style-text);
        font: inherit;
        font-size: 0.95rem;
        text-align: left;
      }
      .picker:hover,
      .picker.open {
        border-color: var(--ted-style-accent, var(--primary-color));
      }
      .picker .picker-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .picker.placeholder .picker-text {
        color: var(--ted-style-muted);
      }
      .picker ha-icon {
        flex: none;
        --mdc-icon-size: 20px;
        color: var(--ted-style-muted);
      }
      .custom-input {
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
      .custom-input:focus {
        outline: none;
        border-color: var(--ted-style-accent, var(--primary-color));
      }

      /* dropdown menus */
      .menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 30;
        max-height: 320px;
        overflow-y: auto;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface, var(--ha-card-background, #fff));
        backdrop-filter: var(--ha-card-backdrop-filter);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      }
      .menu-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 10px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        background: none;
        color: var(--ted-style-text);
        font: inherit;
        font-size: 0.92rem;
        text-align: left;
      }
      .menu-item:hover {
        background: color-mix(in srgb, var(--ted-style-text) 8%, transparent);
      }
      .menu-item.on {
        background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color)) 18%, transparent);
      }
      .menu-item ha-icon {
        flex: none;
        --mdc-icon-size: 20px;
        color: var(--ted-style-muted);
      }
      .menu-item.offline {
        opacity: 0.5;
      }
      .mi-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1 1 auto;
      }
      .mi-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mi-sub {
        font-size: 0.76rem;
        color: var(--ted-style-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mi-check {
        color: var(--ted-style-accent, var(--primary-color));
      }
      .menu-sec {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ted-style-muted);
        padding: 8px 10px 4px;
      }
      .menu-sep {
        height: 1px;
        margin: 4px 6px;
        background: var(--ted-style-divider);
      }
      .menu-empty {
        padding: 10px;
        font-size: 0.85rem;
        color: var(--ted-style-muted);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex: none;
        margin: 0 6px;
        background: var(--ted-style-muted);
      }
      .dot.on {
        background: #3ea55e;
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

      /* mode segmented */
      .seg {
        display: inline-flex;
        gap: 3px;
        padding: 3px;
        border-radius: 10px;
        border: 1px solid var(--ted-style-divider);
      }
      .segbtn {
        padding: 6px 14px;
        border-radius: 7px;
        border: none;
        background: none;
        color: var(--ted-style-muted);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
      }
      .segbtn.on {
        background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color)) 22%, transparent);
        color: var(--ted-style-text);
      }

      /* send */
      .send-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 12px 20px;
        border-radius: 11px;
        border: none;
        cursor: pointer;
        background: var(--ted-style-accent, var(--primary-color));
        color: #fff;
        font: inherit;
        font-weight: 650;
        font-size: 0.98rem;
      }
      .send-btn ha-icon {
        --mdc-icon-size: 20px;
      }
      .send-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .send-btn.sent {
        background: #3ea55e;
      }

      /* recent */
      .sec-label {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ted-style-muted);
      }
      .recent-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 6px;
      }
      .recent-row {
        display: flex;
        align-items: center;
        gap: 4px;
        border-top: 1px solid var(--ted-style-divider);
        padding: 4px 0;
      }
      .recent-row:first-child {
        border-top: none;
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

      /* collapsible Recent (narrow screens) */
      .rec-details summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 6px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ted-style-muted);
      }
      .rec-details summary::-webkit-details-marker {
        display: none;
      }
      .rec-details summary .chev {
        --mdc-icon-size: 18px;
        transition: transform 0.18s ease;
      }
      .rec-details[open] summary .chev {
        transform: rotate(180deg);
      }
      .rec-count {
        margin-left: 4px;
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--ted-style-muted);
        background: color-mix(in srgb, var(--ted-style-text) 8%, transparent);
        border-radius: 999px;
        padding: 1px 8px;
      }

      /* wide enough -> Recent becomes a side rail */
      @container (min-width: 720px) {
        .d-layout.has-recent {
          grid-template-columns: 1.6fr 1fr;
        }
        .d-layout.has-recent .recent-side {
          display: block;
          overflow-y: auto;
          padding: 12px 16px;
          border-left: 1px solid var(--ted-style-divider);
        }
        .d-layout.has-recent .recent-below {
          display: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    [ANNOUNCE_CARD_TYPE]: TedAnnounceCard;
  }
}
