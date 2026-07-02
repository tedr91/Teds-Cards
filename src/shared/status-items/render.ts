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
import { formatDate, formatTimeParts } from "./datetime";
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
  DateStatusItem,
  LedStatusItem,
  NotificationsStatusItem,
  SensorStatusItem,
  SliderModel,
  SpacerStatusItem,
  StatusItem,
  TimeStatusItem,
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
  return items.some((i) => i.type === "time" || i.type === "date");
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
    case "time":
      return renderTimeItem(item, ctx);
    case "date":
      return renderDateItem(item, ctx);
    case "weather":
      return renderWeatherItem(item, ctx);
    case "notifications":
      return renderNotificationsItem(item, ctx, index);
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

function renderTimeItem(item: TimeStatusItem, ctx: StatusItemContext): TemplateResult {
  const now = new Date();
  const lang = ctx.hass.locale?.language || "en";
  const { main, suffix } = formatTimeParts(
    now,
    item.time_format ?? "auto",
    item.time_format_custom ?? "",
    lang,
    ctx.hass.locale?.time_format,
  );
  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.time;
  const show = itemDisplay(item);
  return html`
    <div class="status-item" title=${String(item.name ?? "Time")}>
      ${show.icon ? html`<ha-icon class="status-icon" .icon=${icon}></ha-icon>` : nothing}
      ${show.state
        ? html`<span class="status-text"
            >${main}${suffix ? html`<span class="status-suffix">${suffix}</span>` : nothing}</span
          >`
        : nothing}
    </div>
  `;
}

function renderDateItem(item: DateStatusItem, ctx: StatusItemContext): TemplateResult {
  const now = new Date();
  const lang = ctx.hass.locale?.language || "en";
  const text = formatDate(now, item.date_format ?? "standard", item.date_format_custom ?? "", lang);
  const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.date;
  const show = itemDisplay(item);
  return html`
    <div class="status-item" title=${String(item.name ?? "Date")}>
      ${show.icon ? html`<ha-icon class="status-icon" .icon=${icon}></ha-icon>` : nothing}
      ${show.state ? html`<span class="status-text">${text}</span>` : nothing}
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
  area?: string;
  read?: boolean;
  created?: string;
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

function renderNotificationsItem(
  item: NotificationsStatusItem,
  ctx: StatusItemContext,
  index: number,
): TemplateResult {
  const all = (ctx.hass.states["sensor.teds_notifications"]?.attributes?.notifications ?? []) as NotifRow[];
  const items = item.area ? all.filter((n) => n.area === item.area) : all;
  if (item.hide_when_empty && items.length === 0) return html``;
  const unread = items.filter((n) => !n.read).length;
  const icon = item.icon ?? (unread > 0 ? "mdi:bell-badge" : STATUS_ITEM_DEFAULT_ICON.notifications);
  const anchorId = `${ctx.keyPrefix}-notif-anchor-${index}`;
  const popId = `${ctx.keyPrefix}-notif-pop-${index}`;
  const svc = (service: string, data: Record<string, unknown>) =>
    ctx.hass.callService("teds_cards_backend", service, data);
  return html`
    <div class="status-item">
      <button
        id=${anchorId}
        class="status-icon-button notif-btn"
        popovertarget=${popId}
        title=${String(item.name ?? "Notifications")}
        aria-label="Notifications"
      >
        <ha-icon .icon=${icon}></ha-icon>
        ${unread > 0 ? html`<span class="status-badge">${unread > 99 ? "99+" : unread}</span>` : nothing}
      </button>
      <div id=${popId} class="notif-popover" popover data-anchor=${anchorId} @toggle=${ctx.slider.onPopoverToggle}>
        <div class="notif-pop-head">
          <span>Notifications</span>
          ${items.length
            ? html`<button
                class="notif-clear"
                title="Clear all"
                aria-label="Clear all"
                @click=${() => svc("clear_notifications", item.area ? { area: item.area } : {})}
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
                    <div
                      class="notif-pop-body"
                      @click=${() => !n.read && svc("mark_read", { id: n.id })}
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
    </div>
  `;
}
