/** Pure helpers for resolving status-item state, colors, and slider models. */
import type { HomeAssistant } from "custom-card-helpers";

import {
  DEFAULT_WEATHER_ICON,
  OFF_STATES,
  STATUS_ITEM_DEFAULT_DISPLAY,
  VOLUME_OFF_STATES,
  WEATHER_ICONS,
} from "./const";
import type { LedStatusItem, SliderModel, StatusItem } from "./types";

type StateObj = HomeAssistant["states"][string] | undefined;

export function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function brightnessToPct(brightness?: number): number {
  if (brightness == null) return 0;
  return Math.max(Math.round((brightness * 100) / 255), 1);
}

/** Resolve a configured color (hex / rgb / css var / HA theme color name) to a CSS value. */
export function resolveColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw)) return raw;
  if (/^var\(/i.test(raw)) return raw;
  if (/^[a-z]+(-[a-z]+)*$/i.test(raw)) return `var(--${raw}-color)`;
  return raw;
}

export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

/** Resolved slider bounds + value for a brightness control (light or number domain). */
export function brightnessModel(hass: HomeAssistant | undefined, entityId: string): SliderModel {
  const stateObj = hass?.states[entityId];
  const available = Boolean(stateObj) && stateObj?.state !== "unavailable";
  const domain = entityId.split(".")[0];
  if (domain === "light") {
    const on = stateObj?.state === "on";
    const pct = on ? brightnessToPct(stateObj?.attributes?.brightness as number | undefined) : 0;
    return { min: 0, max: 100, step: 1, value: pct, unit: "%", kind: "light", muted: false, available };
  }
  const value = num(stateObj?.state, 0);
  const min = num(stateObj?.attributes?.min, 0);
  const max = num(stateObj?.attributes?.max, 100);
  const step = num(stateObj?.attributes?.step, 1);
  const unit = (stateObj?.attributes?.unit_of_measurement as string | undefined) ?? "";
  return { min, max, step, value, unit, kind: "number", muted: false, available };
}

/** Resolved slider model for a media_player volume control. */
export function volumeModel(hass: HomeAssistant | undefined, entityId: string): SliderModel {
  const stateObj = hass?.states[entityId];
  const available = !!stateObj && !VOLUME_OFF_STATES.has(stateObj.state);
  const pct = Math.round(num(stateObj?.attributes?.volume_level, 0) * 100);
  const muted = stateObj?.attributes?.is_volume_muted === true;
  return { min: 0, max: 100, step: 1, value: pct, unit: "%", kind: "volume", muted, available };
}

export function formatSensor(stateObj: StateObj, type: "temperature" | "occupancy"): string {
  if (!stateObj) return "—";
  if (type === "occupancy") {
    if (stateObj.state === "on") return "Detected";
    if (stateObj.state === "off") return "Clear";
  }
  const unit = stateObj.attributes?.unit_of_measurement as string | undefined;
  return unit ? `${stateObj.state} ${unit}` : capitalize(stateObj.state);
}

/** Resolve whether a status item shows its icon and/or its state value. */
export function itemDisplay(item: StatusItem): { icon: boolean; state: boolean } {
  const display = item.display ?? STATUS_ITEM_DEFAULT_DISPLAY[item.type];
  return { icon: display !== "state", state: display !== "icon" };
}

/** Inline state text for a brightness/volume item ("61%", "Muted", "—"). */
export function sliderStateText(model: SliderModel): string {
  if (!model.available) return "—";
  if (model.muted) return "Muted";
  return model.kind === "number" ? `${Math.round(model.value)}${model.unit}` : `${Math.round(model.value)}%`;
}

/** Resolve the dot color for a status LED from its on/off/colors config + entity state. */
export function ledColor(item: LedStatusItem, stateObj: StateObj): string {
  const rawState = stateObj?.state ?? "unavailable";
  if (item.colors) {
    const mapped = resolveColor(item.colors[rawState] ?? item.colors[rawState.toLowerCase()]);
    if (mapped) return mapped;
  }
  const isOn = !OFF_STATES.has(rawState.toLowerCase());
  return isOn
    ? resolveColor(item.on_color) ?? "var(--ted-style-success)"
    : resolveColor(item.off_color) ?? "color-mix(in srgb, var(--ted-style-muted) 55%, transparent)";
}

/** First `weather.*` entity id, used when a weather item has no explicit entity. */
export function firstWeatherEntity(hass: HomeAssistant | undefined): string | undefined {
  if (!hass) return undefined;
  return Object.keys(hass.states).find((id) => id.startsWith("weather."));
}

/** MDI icon for a weather entity's condition (or an explicit override). */
export function weatherIcon(stateObj: StateObj, override?: string): string {
  if (override) return override;
  const condition = stateObj?.state;
  return (condition && WEATHER_ICONS[condition]) || DEFAULT_WEATHER_ICON;
}

/** Rounded temperature + unit for a weather entity, or undefined when unavailable. */
export function weatherTemp(hass: HomeAssistant | undefined, stateObj: StateObj): string | undefined {
  const temp = stateObj?.attributes?.temperature;
  if (typeof temp !== "number") return undefined;
  const unit =
    (stateObj?.attributes?.temperature_unit as string | undefined) ??
    hass?.config?.unit_system?.temperature ??
    "";
  return `${Math.round(temp)}${unit}`;
}
