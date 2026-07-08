/**
 * Lit render functions for every status item. Hosts (Room Card, Navbar Card)
 * call `renderStatusItem(item, ctx, index)` for each item; interactive items
 * route through the shared `StatusSliderController` on the context.
 */
import { html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant } from "custom-card-helpers";

import { STATUS_ITEM_DEFAULT_ICON, DEFAULT_SPACER_SIZE } from "./const";
import { resolveDeviceArea } from "../device-area";
import { settingsStore } from "../settings";
import { formatDate, formatTime } from "./datetime";
import {
  brightnessModel,
  capitalize,
  firstWeatherEntity,
  formatSensor,
  itemDisplay,
  ledColor,
  sliderStateText,
  volumeModel,
  weatherIcon,
  weatherTemp,
} from "./model";
import type { StatusSliderController } from "./slider-controller";
import type {
  BrightnessStatusItem,
  DateTimeStatusItem,
  LedStatusItem,
  NotificationsStatusItem,
  AlarmsStatusItem,
  TimersStatusItem,
  SensorStatusItem,
  SliderModel,
  SpacerStatusItem,
  StatusItem,
  VolumeStatusItem,
  WeatherStatusItem,
} from "./types";

/** Everything a status-item renderer needs from its host. */
export interface StatusItemContext {
  hass: HomeAssistant;
  /** Shared controller managing brightness/volume popovers. */
  slider: StatusSliderController;
  /** Unique-per-host prefix for popover/anchor element ids. */
  keyPrefix: string;
  /** Room Card injects area-based entity resolution; other hosts omit it. */
  resolveAreaEntity?: (kind: "temperature" | "occupancy") => string | undefined;
}

/** True when a list contains a live clock/date item (so the host should tick). */
export function hasClockItem(items: readonly StatusItem[]): boolean {
  return items.some((i) => i.type === "datetime");
}

export function renderStatusItem(item: StatusItem, ctx: StatusItemContext, index: number): TemplateResult {
  switch (item.type) {
    case "temperature":
    case "occupancy":
      return renderSensorItem(item, ctx);
    case "brightness":
      return renderBrightnessItem(item, ctx, index);
    case "volume":
      return renderVolumeItem(item, ctx, index);
    case "led":
      return renderLedItem(item, ctx);
    case "spacer":
      return renderSpacerItem(item);
    case "datetime":
      return renderDateTimeItem(item, ctx);
    case "weather":
      return renderWeatherItem(item, ctx);
    case "notifications":
      return renderNotificationsItem(item, ctx, index);
    case "alarms":
      return renderCountItem(item, ctx, index);
    case "timers":
      return renderCountItem(item, ctx, index);
  }
}

function renderSensorItem(item: SensorStatusItem, ctx: StatusItemContext): TemplateResult {
  const entityId = item.entity ?? ctx.resolveAreaEntity?.(item.type);
  const stateObj = entityId ? ctx.hass.states[entityId] : undefined;
  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON[item.type];
  const label = String(item.name ?? stateObj?.attributes?.friendly_name ?? entityId ?? "");
  const show = itemDisplay(item);
  return html`
    <div class="status-item" title=${label}>
      ${show.icon ? html`<ha-icon class="status-icon" .icon=${icon}></ha-icon>` : nothing}
      ${show.state
        ? html`<span class="status-text">${formatSensor(stateObj, item.type)}</span>`
        : nothing}
    </div>
  `;
}

function renderSpacerItem(item: SpacerStatusItem): TemplateResult {
  const size = typeof item.size === "number" ? item.size : DEFAULT_SPACER_SIZE;
  return html`<div class="status-spacer" style=${styleMap({ width: `${size}px` })}></div>`;
}

function renderLedItem(item: LedStatusItem, ctx: StatusItemContext): TemplateResult {
  const stateObj = ctx.hass.states[item.entity];
  const color = ledColor(item, stateObj);
  const label = String(item.name ?? stateObj?.attributes?.friendly_name ?? item.entity);
  const show = itemDisplay(item);
  return html`
    <div class="status-item" title=${label}>
      ${show.icon
        ? html`<span
            class="status-led"
            style=${styleMap({ background: color, boxShadow: `0 0 6px ${color}` })}
          ></span>`
        : nothing}
      ${show.state
        ? html`<span class="status-text">${stateObj ? capitalize(stateObj.state) : "—"}</span>`
        : nothing}
    </div>
  `;
}

function renderBrightnessItem(item: BrightnessStatusItem, ctx: StatusItemContext, index: number): TemplateResult {
  const model = brightnessModel(ctx.hass, item.entity);
  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.brightness;
  const anchorId = `${ctx.keyPrefix}-bri-anchor-${index}`;
  const popId = `${ctx.keyPrefix}-bri-pop-${index}`;
  const key = `${ctx.keyPrefix}-bri-${index}`;
  const show = itemDisplay(item);
  return html`
    <div class="status-item">
      ${show.icon
        ? html`<button
            id=${anchorId}
            class="status-icon-button"
            popovertarget=${popId}
            ?disabled=${!model.available}
            title=${String(item.name ?? "Brightness")}
            aria-label="Brightness"
          >
            <ha-icon .icon=${icon}></ha-icon>
          </button>`
        : nothing}
      ${show.state ? html`<span class="status-text">${sliderStateText(model)}</span>` : nothing}
    </div>
    ${show.icon ? renderSliderPopover(ctx, popId, anchorId, key, item, model, icon) : nothing}
  `;
}

function renderVolumeItem(item: VolumeStatusItem, ctx: StatusItemContext, index: number): TemplateResult {
  const model = volumeModel(ctx.hass, item.entity);
  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.volume;
  const anchorId = `${ctx.keyPrefix}-vol-anchor-${index}`;
  const popId = `${ctx.keyPrefix}-vol-pop-${index}`;
  const key = `${ctx.keyPrefix}-vol-${index}`;
  const show = itemDisplay(item);
  return html`
    <div class="status-item">
      ${show.icon
        ? html`<button
            id=${anchorId}
            class=${classMap({ "status-icon-button": true, "is-active": model.muted })}
            ?disabled=${!model.available}
            @click=${() => ctx.slider.onVolumeClick(item.entity, popId)}
            title="Volume — double-tap to mute"
            aria-label="Volume"
          >
            <ha-icon .icon=${model.muted ? "mdi:volume-off" : icon}></ha-icon>
          </button>`
        : nothing}
      ${show.state ? html`<span class="status-text">${sliderStateText(model)}</span>` : nothing}
    </div>
    ${show.icon ? renderSliderPopover(ctx, popId, anchorId, key, item, model, icon) : nothing}
  `;
}

function renderSliderPopover(
  ctx: StatusItemContext,
  popId: string,
  anchorId: string,
  key: string,
  item: StatusItem,
  model: SliderModel,
  icon: string,
): TemplateResult {
  const live = ctx.slider.value(key, model.value);
  const span = model.max - model.min || 1;
  const fill = Math.max(0, Math.min(100, Math.round(((live - model.min) / span) * 100)));
  const readout = model.muted
    ? "Muted"
    : model.kind === "number"
      ? `${Math.round(live)}${model.unit}`
      : `${Math.round(live)}%`;
  return html`
    <div
      id=${popId}
      class="slider-popover"
      popover
      data-anchor=${anchorId}
      @toggle=${ctx.slider.onPopoverToggle}
    >
      <span class="slider-popover-value">${readout}</span>
      <input
        class=${classMap({ "si-slider": true, "is-muted": model.muted })}
        type="range"
        orient="vertical"
        min=${model.min}
        max=${model.max}
        step=${model.step}
        style=${`--ted-style-fill:${fill}%`}
        .value=${String(live)}
        ?disabled=${!model.available}
        aria-label=${item.type === "volume" ? "Volume" : "Brightness"}
        @input=${(ev: Event) => ctx.slider.onInput(ev, key)}
        @change=${(ev: Event) => ctx.slider.onChange(ev, item)}
      />
      <ha-icon class="slider-popover-icon" .icon=${icon}></ha-icon>
    </div>
  `;
}

function renderDateTimeItem(item: DateTimeStatusItem, ctx: StatusItemContext): TemplateResult {
  const now = new Date();
  const lang = ctx.hass.locale?.language || "en";
  const mode = item.display ?? "both";
  const showDate = mode !== "time";
  const showTime = mode !== "date";
  const dateText = showDate ? formatDate(now, item.date_format ?? "", lang) : "";
  const timeText = showTime ? formatTime(now, item.time_format ?? "") : "";
  const autoLabel = [dateText, timeText].filter(Boolean).join(" • ") || "Date/Time";
  const label = String(item.name ?? autoLabel);
  return html`
    <div class="status-item" title=${label}>
      ${showDate ? html`<span class="status-text">${dateText}</span>` : nothing}
      ${showTime ? html`<span class="status-text">${timeText}</span>` : nothing}
    </div>
  `;
}

function renderWeatherItem(item: WeatherStatusItem, ctx: StatusItemContext): TemplateResult {
  const entityId = item.entity ?? firstWeatherEntity(ctx.hass);
  const stateObj = entityId ? ctx.hass.states[entityId] : undefined;
  const icon = weatherIcon(stateObj, item.icon);
  const temp = weatherTemp(ctx.hass, stateObj);
  const label = String(item.name ?? stateObj?.attributes?.friendly_name ?? "Weather");
  const show = itemDisplay(item);
  return html`
    <div class="status-item" title=${label}>
      ${show.icon ? html`<ha-icon class="status-icon status-weather-icon" .icon=${icon}></ha-icon>` : nothing}
      ${show.state
        ? html`<span class="status-text">${temp ?? (stateObj ? capitalize(stateObj.state) : "—")}</span>`
        : nothing}
    </div>
  `;
}

interface NotifRow {
  id: string;
  title?: string;
  message: string;
  severity?: string;
  icon?: string;
  area?: string;
  read?: boolean;
  created?: string;
}

/** Severity → default icon (mirrors the toast) when a notification has no explicit icon. */
const NOTIF_SEVERITY_ICON: Record<string, string> = {
  info: "mdi:information-outline",
  success: "mdi:check-circle-outline",
  warning: "mdi:alert-outline",
  danger: "mdi:alert-circle-outline",
  tip: "mdi:lightbulb-on-outline",
};

/** The icon to show for a notification: its own icon, else a severity default. */
function notifIcon(n: NotifRow): string {
  return n.icon || NOTIF_SEVERITY_ICON[n.severity ?? "info"] || "mdi:bell-outline";
}

/** "just now" / "5m ago" / "2h ago" / "3d ago" — mirrors the Notification Center card. */
function notifTimeAgo(iso?: string): string {
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

/** Scoped row from the alarms/timers sensor: the fields the item needs. */
interface CountRow {
  id?: string;
  location?: string | null;
  enabled?: boolean;
  paused?: boolean;
}

/** An option in a status item's hold-to-open menu. */
interface ItemOption {
  label: string;
  handler: () => void;
}

/** Resolve a `[root]`-templated dashboard setting into a leading-slash path. */
function resolveDashboardPath(key: string): string {
  const eff = settingsStore.effective();
  const root = String(eff.dashboard_root ?? "ted-dashboard");
  let path = String(eff[key] ?? "").replace("[root]", root);
  if (path && !path.startsWith("/")) path = `/${path}`;
  return path;
}

/** Client-side navigation matching Home Assistant's `navigate` action. */
function navigateTo(path: string): void {
  if (!path) return;
  history.pushState(null, "", path);
  window.dispatchEvent(new Event("location-changed"));
}

/** A hold-to-open options popover (list of buttons); each closes it after running. */
function renderOptionsPopover(
  ctx: StatusItemContext,
  popId: string,
  anchorId: string,
  options: readonly ItemOption[],
): TemplateResult {
  return html`
    <div
      id=${popId}
      class="notif-popover opts-popover"
      popover
      data-anchor=${anchorId}
      @toggle=${ctx.slider.onPopoverToggle}
    >
      <div class="opts-menu">
        ${options.map(
          (o) => html`<button
            class="opts-btn"
            @click=${() => {
              o.handler();
              ctx.slider.closePopover(popId);
            }}
          >
            ${o.label}
          </button>`,
        )}
      </div>
    </div>
  `;
}

/**
 * Icon + count badge for the alarms / timers sensors. Scoped to this device's
 * area (config → View Assist → browser_mod → localStorage) plus house-wide
 * (area-less) items. Hidden entirely when empty unless `hide_when_empty: false`.
 *
 * Tap navigates to the configured dashboard; hold opens an options menu
 * (View / Disable alarms, or View / Pause all / Cancel all timers).
 */
function renderCountItem(
  item: AlarmsStatusItem | TimersStatusItem,
  ctx: StatusItemContext,
  index: number,
): TemplateResult {
  const isAlarms = item.type === "alarms";
  const sensor = isAlarms ? "sensor.teds_alarms" : "sensor.teds_timers";
  const attr = isAlarms ? "alarms" : "active";
  const rows = (ctx.hass.states[sensor]?.attributes?.[attr] ?? []) as CountRow[];
  const area = resolveDeviceArea(ctx.hass, item.area).area;
  let items = isAlarms ? rows.filter((r) => r.enabled) : rows;
  if (area) items = items.filter((r) => !r.location || r.location === area);
  const count = items.length;
  // Default is to hide when there's nothing set (only show when count > 0).
  if (item.hide_when_empty !== false && count === 0) return html``;

  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON[item.type];
  const label = String(item.name ?? (isAlarms ? "Alarms" : "Timers"));
  const showBadge = count > 0 && item.display_badge !== false;
  const navPath = resolveDashboardPath(isAlarms ? "alarms_dashboard" : "timers_dashboard");
  const anchorId = `${ctx.keyPrefix}-cnt-anchor-${index}`;
  const optsPopId = `${ctx.keyPrefix}-cnt-opts-${index}`;
  const svc = (service: string, data: Record<string, unknown>) =>
    ctx.hass.callService("teds_cards_backend", service, data);

  const options: ItemOption[] = isAlarms
    ? [
        { label: "View Alarms", handler: () => navigateTo(navPath) },
        {
          label: "Disable Alarms",
          handler: () => items.forEach((a) => a.id && svc("update_alarm", { id: a.id, enabled: false })),
        },
      ]
    : [
        { label: "View Timers", handler: () => navigateTo(navPath) },
        {
          label: "Pause all timers",
          handler: () => items.forEach((t) => t.id && !t.paused && svc("pause_timer", { id: t.id })),
        },
        {
          label: "Cancel all timers",
          handler: () => items.forEach((t) => t.id && svc("cancel_timer", { id: t.id })),
        },
      ];

  return html`
    <div class="status-item">
      <button
        id=${anchorId}
        class="status-icon-button notif-btn"
        title=${label}
        aria-label=${label}
        @pointerdown=${() => ctx.slider.startHold(optsPopId)}
        @pointerleave=${() => ctx.slider.cancelHold()}
        @pointercancel=${() => ctx.slider.cancelHold()}
        @click=${() => {
          if (!ctx.slider.consumeHold()) navigateTo(navPath);
        }}
      >
        <ha-icon .icon=${icon}></ha-icon>
        ${showBadge ? html`<span class="status-badge">${count > 99 ? "99+" : count}</span>` : nothing}
      </button>
      ${renderOptionsPopover(ctx, optsPopId, anchorId, options)}
    </div>
  `;
}

function renderNotificationsItem(
  item: NotificationsStatusItem,
  ctx: StatusItemContext,
  index: number,
): TemplateResult {
  const all = (ctx.hass.states["sensor.teds_notifications"]?.attributes?.notifications ?? []) as NotifRow[];
  // Scope to this device's area (config override → View Assist → browser_mod →
  // localStorage), showing that area's notifications plus house-wide (area-less) ones.
  const area = resolveDeviceArea(ctx.hass, item.area).area;
  const items = area ? all.filter((n) => !n.area || n.area === area) : all;
  if (item.hide_when_empty !== false && items.length === 0) return html``;
  const unread = items.filter((n) => !n.read).length;
  const icon = item.icon ?? (unread > 0 ? "mdi:bell-badge" : STATUS_ITEM_DEFAULT_ICON.notifications);
  const showBadge = unread > 0 && item.display_badge !== false;
  const anchorId = `${ctx.keyPrefix}-notif-anchor-${index}`;
  const popId = `${ctx.keyPrefix}-notif-pop-${index}`;
  const detailPopId = `${popId}-detail`;
  const optsPopId = `${popId}-opts`;
  const svc = (service: string, data: Record<string, unknown>) =>
    ctx.hass.callService("teds_cards_backend", service, data);
  const dnd = settingsStore.effective().do_not_disturb === true;
  const dndOptions: ItemOption[] = [
    {
      label: dnd ? "Disable Do not disturb" : "Enable Do not disturb",
      handler: () => settingsStore.setValue("device", "do_not_disturb", !dnd),
    },
  ];
  return html`
    <div class="status-item">
      <button
        id=${anchorId}
        class="status-icon-button notif-btn"
        title=${String(item.name ?? "Notifications")}
        aria-label="Notifications"
        @pointerdown=${() => ctx.slider.startHold(optsPopId)}
        @pointerleave=${() => ctx.slider.cancelHold()}
        @pointercancel=${() => ctx.slider.cancelHold()}
        @click=${() => {
          if (!ctx.slider.consumeHold()) ctx.slider.openPopover(popId);
        }}
      >
        <ha-icon .icon=${icon}></ha-icon>
        ${showBadge ? html`<span class="status-badge">${unread > 99 ? "99+" : unread}</span>` : nothing}
      </button>
      ${renderOptionsPopover(ctx, optsPopId, anchorId, dndOptions)}
      <div id=${popId} class="notif-popover" popover data-anchor=${anchorId} @toggle=${ctx.slider.onPopoverToggle}>
        <div class="notif-pop-head">
          <span>Notifications</span>
          ${items.length
            ? html`<button
                class="notif-clear"
                title="Clear all"
                aria-label="Clear all"
                @click=${() =>
                  area
                    ? items.forEach((n) => svc("dismiss_notification", { id: n.id }))
                    : svc("clear_notifications", {})}
              >
                <ha-icon icon="mdi:notification-clear-all"></ha-icon>
              </button>`
            : nothing}
        </div>
        <div class="notif-pop-list">
          ${items.length === 0
            ? html`<div class="notif-empty">No notifications.</div>`
            : items.map(
                (n) => html`
                  <div class="notif-pop-row sev-${n.severity ?? "info"} ${n.read ? "read" : ""}">
                    <ha-icon class="notif-pop-icon" .icon=${notifIcon(n)}></ha-icon>
                    <div
                      class="notif-pop-body"
                      @click=${() => {
                        if (!n.read) svc("mark_read", { id: n.id });
                        ctx.slider.openNotifDetail(n, detailPopId);
                      }}
                    >
                      <div class="notif-pop-top">
                        ${!n.read ? html`<span class="notif-unread-dot"></span>` : nothing}
                        ${n.title ? html`<span class="notif-pop-title">${n.title}</span>` : nothing}
                        <span class="notif-pop-time">${notifTimeAgo(n.created)}</span>
                      </div>
                      <div class="notif-pop-msg">${n.message}</div>
                    </div>
                    <button
                      class="notif-pop-x"
                      aria-label="Dismiss"
                      @click=${() => svc("dismiss_notification", { id: n.id })}
                    >
                      ✕
                    </button>
                  </div>
                `,
              )}
        </div>
      </div>
      <div
        id=${detailPopId}
        class="notif-detail-popover"
        popover
        @toggle=${ctx.slider.onNotifDetailToggle}
      >
        ${renderNotifDetail(ctx, detailPopId)}
      </div>
    </div>
  `;
}

/** Full-notification content for the centered detail modal. */
function renderNotifDetail(ctx: StatusItemContext, detailPopId: string): TemplateResult {
  const d = ctx.slider.notifDetail;
  return html`
    <div class="notif-detail sev-${d?.severity ?? "info"}">
      <div class="notif-detail-head">
        <ha-icon
          class="notif-detail-icon"
          .icon=${d ? notifIcon(d as NotifRow) : "mdi:bell-outline"}
        ></ha-icon>
        ${d?.title ? html`<span class="notif-detail-title">${d.title}</span>` : nothing}
        <button
          class="notif-detail-x"
          aria-label="Close"
          @click=${() => ctx.slider.closeNotifDetail(detailPopId)}
        >
          ✕
        </button>
      </div>
      ${d?.created ? html`<div class="notif-detail-time">${notifTimeAgo(d.created)}</div>` : nothing}
      <div class="notif-detail-msg">${d?.message ?? ""}</div>
    </div>
  `;
}
