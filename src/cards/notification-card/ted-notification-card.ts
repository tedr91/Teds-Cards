import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { NotificationToastController, type TedNotification } from "../../shared/notifications";
import { resolveDeviceArea } from "../../shared/device-area";
import "../../shared/ted-icon-button";
import {
  NOTIFICATIONS_SENSOR,
  NOTIFICATION_CARD_DESCRIPTION,
  NOTIFICATION_CARD_EDITOR_TYPE,
  NOTIFICATION_CARD_NAME,
  NOTIFICATION_CARD_TYPE,
  NOTIFICATION_DOMAIN,
} from "./const";
import type { NotificationCardConfig } from "./types";

interface NotifAction {
  label?: string;
  action?: "dismiss" | "navigate" | "call-service" | "more-info" | "url";
  navigation_path?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  entity?: string;
  url?: string;
  variant?: "primary" | "default";
}

const SEVERITY_ICON: Record<string, string> = {
  info: "mdi:information-outline",
  success: "mdi:check-circle-outline",
  warning: "mdi:alert-outline",
  danger: "mdi:alert-circle-outline",
  tip: "mdi:lightbulb-on-outline",
};

interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

registerCustomCard({
  type: NOTIFICATION_CARD_TYPE,
  name: NOTIFICATION_CARD_NAME,
  description: NOTIFICATION_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#notification-center-card",
});

@customElement(NOTIFICATION_CARD_TYPE)
export class TedNotificationCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-notification-card-editor");
    return document.createElement(NOTIFICATION_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<NotificationCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: NotificationCardConfig;
  private _markedReadFor = -1;

  public constructor() {
    super();
    new NotificationToastController(this, () => ({
      hass: this.hass,
      area: this._effectiveArea(),
      enabled: this._config?.show_toasts !== false,
    }));
  }

  public setConfig(config: NotificationCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return { columns: 6, rows: "auto", min_columns: 4, min_rows: 2 };
  }

  private get _all(): TedNotification[] {
    const list = (this.hass?.states[NOTIFICATIONS_SENSOR]?.attributes.notifications as TedNotification[]) ?? [];
    const area = this._effectiveArea();
    const filtered = area ? list.filter((n) => !n.area || n.area === area) : list;
    const max = typeof this._config?.max_items === "number" ? this._config.max_items : 50;
    return filtered.slice(0, max);
  }

  /** This device's effective area (config override → View Assist → browser_mod → localStorage). */
  private _effectiveArea(): string | undefined {
    return resolveDeviceArea(this.hass, this._config?.area).area;
  }

  /** Full (uncapped) scoped notification list: this area's items plus house-wide ones. */
  private _scoped(): TedNotification[] {
    const list = (this.hass?.states[NOTIFICATIONS_SENSOR]?.attributes.notifications as TedNotification[]) ?? [];
    const area = this._effectiveArea();
    return area ? list.filter((n) => !n.area || n.area === area) : list;
  }

  private _areaName(id?: string): string | undefined {
    if (!id) return undefined;
    const areas = (this.hass as { areas?: Record<string, { name?: string }> } | undefined)?.areas;
    return areas?.[id]?.name;
  }

  private _call(service: string, data: Record<string, unknown>): void {
    this.hass?.callService(NOTIFICATION_DOMAIN, service, data);
  }

  protected updated(): void {
    // Optionally mark everything read once the (always-visible) center shows unread items.
    if (this._config?.mark_read_on_open !== true) return;
    const unread = this._all.filter((n) => !n.read).length;
    if (unread > 0 && this._markedReadFor !== unread) {
      this._markedReadFor = unread;
      const area = this._effectiveArea();
      if (area) this._scoped().forEach((n) => !n.read && this._markRead(n.id));
      else this._call("mark_read", {});
    }
  }

  private _dismiss(id: string): void {
    this._call("dismiss_notification", { id });
  }
  private _markRead(id: string): void {
    this._call("mark_read", { id });
  }
  private _clearAll(): void {
    const area = this._effectiveArea();
    // Area-scoped: the list shows this area's items plus house-wide ones; the
    // backend's area filter would leave house-wide behind, so clear by id.
    if (area) this._scoped().forEach((n) => this._dismiss(n.id));
    else this._call("clear_notifications", {});
  }
  private _markAllRead(): void {
    const area = this._effectiveArea();
    if (area) this._scoped().forEach((n) => !n.read && this._markRead(n.id));
    else this._call("mark_read", {});
  }

  private _runAction(n: TedNotification, a: NotifAction): void {
    switch (a.action) {
      case "navigate":
        if (a.navigation_path) {
          history.pushState(null, "", a.navigation_path);
          fireEvent(window, "location-changed", { replace: false } as never);
        }
        break;
      case "call-service":
        if (a.service) {
          const [domain, srv] = a.service.split(".");
          if (domain && srv) this.hass?.callService(domain, srv, a.service_data ?? {});
        }
        break;
      case "more-info":
        if (a.entity) fireEvent(this, "hass-more-info", { entityId: a.entity });
        break;
      case "url":
        if (a.url) window.open(a.url, "_blank", "noopener");
        break;
      case "dismiss":
      default:
        break;
    }
    // Any action also dismisses the notification.
    this._dismiss(n.id);
  }

  /** "just now" / "5m ago" / "2h ago" / "3d ago". */
  private _timeAgo(iso?: string): string {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 45) return "just now";
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;

    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const shadow = cfg.shadow !== false;
    const brushed = cfg.brushed === true;
    const missing = !this.hass.states[NOTIFICATIONS_SENSOR];
    const items = this._all;
    const unread = items.filter((n) => !n.read).length;
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
                icon=${unread > 0 ? "mdi:bell-badge" : "mdi:bell-outline"}
                style=${styleMap({ "--mdc-icon-size": `calc(22px * ${iconScale / 100})` })}
              ></ha-icon>`
            : nothing}
          ${showName
            ? html`<span style=${styleMap({ fontSize: `calc(1.05rem * ${nameScale / 100})` })}
                >${cfg.title ?? "Notifications"}</span
              >`
            : nothing}
          ${unread > 0 ? html`<span class="badge">${unread}</span>` : nothing}
          ${items.length
            ? html`<ted-icon-button
                class="clear-hdr"
                label="Clear all"
                icon="mdi:notification-clear-all"
                @click=${this._clearAll}
              ></ted-icon-button>`
            : nothing}
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use notifications.</div>`
          : html`
              <div class="list">
                ${items.length === 0
                  ? html`<div class="empty">No notifications.</div>`
                  : repeat(
                      items,
                      (n) => n.id,
                      (n) => this._renderRow(n),
                    )}
              </div>
              ${unread > 0
                ? html`<div class="foot">
                    <button class="nc-btn" @click=${this._markAllRead}>Mark all read</button>
                  </div>`
                : nothing}
            `}
      </ha-card>
    `;
  }

  private _renderRow(n: TedNotification): TemplateResult {
    const sev = n.severity ?? "info";
    const icon = n.icon || SEVERITY_ICON[sev] || "mdi:bell-outline";
    const room = this._config?.area ? undefined : this._areaName(n.area);
    const actions = (Array.isArray(n.actions) ? n.actions : []) as NotifAction[];
    return html`
      <div class="row sev-${sev} ${n.read ? "read" : ""}">
        <ha-icon class="row-icon" icon=${icon}></ha-icon>
        <div class="row-body" @click=${() => !n.read && this._markRead(n.id)}>
          <div class="row-top">
            ${!n.read ? html`<span class="unread-dot"></span>` : nothing}
            ${n.title ? html`<span class="row-title">${n.title}</span>` : nothing}
            <span class="row-time">${this._timeAgo(n.created)}</span>
          </div>
          <div class="row-msg">${n.message}</div>
          ${room ? html`<span class="room">${room}</span>` : nothing}
          ${actions.length
            ? html`<div class="row-actions">
                ${actions.map(
                  (a) => html`<button
                    class="nc-btn ${a.variant === "primary" ? "primary" : ""}"
                    @click=${() => this._runAction(n, a)}
                  >
                    ${a.label ?? "OK"}
                  </button>`,
                )}
              </div>`
            : nothing}
        </div>
        <ted-icon-button
          class="row-close"
          label="Dismiss"
          icon="mdi:close"
          @click=${() => this._dismiss(n.id)}
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
      .badge {
        font-size: 0.72rem;
        font-weight: 700;
        line-height: 1;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--ted-style-on-accent);
        background: var(--ted-style-accent);
      }
      .clear-hdr {
        margin-left: auto;
        flex: none;
        --ted-ib-size: 30px;
        --ted-ib-icon: 22px;
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
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
      }
      .row {
        --nc-accent: var(--ted-style-accent);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 8px 10px 14px;
        border-top: 1px solid var(--ted-style-divider);
        border-left: 3px solid var(--nc-accent);
      }
      .row.read {
        opacity: 0.62;
      }
      .row.sev-info {
        --nc-accent: #4cc2ff;
      }
      .row.sev-success {
        --nc-accent: #6ccb5f;
      }
      .row.sev-warning {
        --nc-accent: #ffb454;
      }
      .row.sev-danger {
        --nc-accent: #ff99a4;
      }
      .row.sev-tip {
        --nc-accent: #9b6cff;
      }
      .row-icon {
        color: var(--nc-accent);
        --mdc-icon-size: 22px;
        flex: none;
        margin-top: 1px;
      }
      .row-body {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .row:not(.read) .row-body {
        cursor: pointer;
      }
      .row-top {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .unread-dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--nc-accent);
        align-self: center;
      }
      .row-title {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row-time {
        margin-left: auto;
        font-size: 0.72rem;
        color: var(--ted-style-muted);
        flex: none;
      }
      .row-msg {
        font-size: 0.9rem;
        color: var(--ted-style-text);
        overflow-wrap: anywhere;
      }
      .room {
        align-self: flex-start;
        font-size: 0.68rem;
        padding: 2px 6px;
        border-radius: var(--ted-style-radius-sm);
        background: color-mix(in srgb, var(--nc-accent) 24%, transparent);
        color: var(--ted-style-text);
      }
      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .row-close {
        flex: none;
        --ted-ib-size: 34px;
        --ted-ib-icon: 18px;
      }
      .foot {
        flex: none;
        display: flex;
        justify-content: flex-end;
        padding: 8px 12px 2px;
      }
      .nc-btn {
        appearance: none;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: var(--ted-style-text);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: var(--ted-style-radius-sm);
        cursor: pointer;
      }
      .nc-btn:hover {
        border-color: var(--ted-style-accent);
      }
      .nc-btn.primary {
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
        border-color: var(--ted-style-accent);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-notification-card": TedNotificationCard;
  }
}
