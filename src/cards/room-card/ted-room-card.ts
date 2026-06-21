import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  ROOM_CARD_DESCRIPTION,
  ROOM_CARD_EDITOR_TYPE,
  ROOM_CARD_NAME,
  ROOM_CARD_TYPE,
  STATUS_ITEM_DEFAULT_ICON,
} from "./const";
import type {
  RoomButtonSection,
  RoomCardConfig,
  RoomLedStatusItem,
  RoomSensorStatusItem,
  RoomStatusItem,
} from "./types";

/** Minimal shape of an area registry entry (not in custom-card-helpers' types). */
interface AreaEntry {
  area_id: string;
  name: string;
}

/** Entity registry entry — used to map entities to an area. */
interface EntityRegistryEntry {
  area_id?: string | null;
  device_id?: string | null;
}

/** Device registry entry — an entity inherits its device's area when it has none. */
interface DeviceRegistryEntry {
  area_id?: string | null;
}

/** Home Assistant exposes the area / entity / device registries on `hass` at runtime. */
type HassWithRegistries = HomeAssistant & {
  areas?: Record<string, AreaEntry>;
  entities?: Record<string, EntityRegistryEntry>;
  devices?: Record<string, DeviceRegistryEntry>;
};

/** The Lovelace card-helper surface we use to embed the button sub-cards. */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/** A cached embedded button element plus the serialized config it was built from. */
interface ButtonEntry {
  el: LovelaceCard;
  json: string;
}

/** Resolved slider bounds + current value for a brightness / volume control. */
interface SliderModel {
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  kind: "light" | "number" | "volume";
  muted: boolean;
  available: boolean;
}

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

/** Entity states treated as "off / inactive" for status-LED coloring. */
const OFF_STATES = new Set([
  "off",
  "unavailable",
  "unknown",
  "closed",
  "idle",
  "standby",
  "false",
  "no",
  "0",
  "",
]);

/**
 * media_player states where the volume control is inert (the player is off).
 * Mirrors the Denon Marantz card; note `idle` counts as ON (e.g. an AVR that is
 * powered on but not playing), so it is intentionally excluded.
 */
const VOLUME_OFF_STATES = new Set(["off", "standby", "unavailable", "unknown", ""]);

/** Delay used to distinguish a single tap (open volume slider) from a double tap (mute). */
const VOLUME_DOUBLE_TAP_MS = 220;

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Convert HA brightness (0–255) to a 1–100% scale. */
function brightnessToPct(brightness?: number): number {
  if (brightness == null) return 0;
  return Math.max(Math.round((brightness * 100) / 255), 1);
}

/** Resolve a configured color (hex / rgb / css var / HA theme color name) to a CSS value. */
function resolveColor(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw)) return raw;
  if (/^var\(/i.test(raw)) return raw;
  if (/^[a-z]+(-[a-z]+)*$/i.test(raw)) return `var(--${raw}-color)`;
  return raw;
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

registerCustomCard({
  type: ROOM_CARD_TYPE,
  name: ROOM_CARD_NAME,
  description: ROOM_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#room-card",
});

@customElement(ROOM_CARD_TYPE)
export class TedRoomCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-room-card-editor");
    return document.createElement(ROOM_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<RoomCardConfig, "type"> {
    const areas = (hass as HassWithRegistries).areas ?? {};
    const firstArea = Object.keys(areas)[0];
    return { area: firstArea ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: RoomCardConfig;
  /** Transient live value of the slider currently being dragged (one at a time). */
  @state() private _activeSlider?: { key: string; value: number };

  /** Lazily-loaded Lovelace card helpers (for embedding the button sub-cards). */
  private _helpers?: CardHelpers;
  /** Embedded button elements, keyed by `${sectionIndex}:${buttonIndex}`. */
  private _buttonEls = new Map<string, ButtonEntry>();
  private _volumeClickTimer?: number;
  private _volumeClosedAt = 0;

  public setConfig(config: RoomCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    const sections = this._config?.sections?.length ?? 0;
    return 1 + sections * 2;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 12,
      rows: "auto",
      min_columns: 6,
    };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._volumeClickTimer !== undefined) {
      window.clearTimeout(this._volumeClickTimer);
      this._volumeClickTimer = undefined;
    }
  }

  protected firstUpdated(): void {
    void this._loadHelpers();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) {
      this._buildButtonElements();
    }
    if (changed.has("hass")) {
      this._propagateHass();
    }
  }

  // --- Embedded button sub-cards -------------------------------------------

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildButtonElements();
    this.requestUpdate();
  }

  /** (Re)build the cached button elements, reusing any whose config is unchanged. */
  private _buildButtonElements(): void {
    if (!this._helpers || !this._config) return;
    const next = new Map<string, ButtonEntry>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      (section.buttons ?? []).forEach((button, bIdx) => {
        const key = `${sIdx}:${bIdx}`;
        const json = JSON.stringify(button);
        const existing = this._buttonEls.get(key);
        if (existing && existing.json === json) {
          next.set(key, existing);
          return;
        }
        const el = this._helpers!.createCardElement(button as LovelaceCardConfig);
        // Render buttons as grid items so cards that otherwise apply a fixed
        // width/height (light, cover) fill the square cell instead.
        (el as unknown as { layout?: string }).layout = "grid";
        el.hass = this.hass;
        next.set(key, { el, json });
      });
    });
    this._buttonEls = next;
  }

  private _propagateHass(): void {
    for (const entry of this._buttonEls.values()) {
      entry.el.hass = this.hass;
    }
  }

  // --- Area entity resolution ----------------------------------------------

  /** Resolve the configured area's display name (falls back to the raw id). */
  private _areaName(): string | undefined {
    const areaId = this._config?.area;
    if (!areaId) return undefined;
    const areas = (this.hass as HassWithRegistries | undefined)?.areas;
    return areas?.[areaId]?.name ?? areaId;
  }

  /** Find the first entity in the card's area matching the wanted device class(es). */
  private _resolveAreaEntity(kind: "temperature" | "occupancy"): string | undefined {
    const area = this._config?.area;
    if (!area || !this.hass) return undefined;
    const hass = this.hass as HassWithRegistries;
    const entities = hass.entities;
    if (!entities) return undefined;
    const want =
      kind === "temperature" ? ["temperature"] : ["occupancy", "motion", "presence"];
    for (const [entityId, entry] of Object.entries(entities)) {
      const areaId =
        entry.area_id ?? (entry.device_id ? hass.devices?.[entry.device_id]?.area_id : undefined);
      if (areaId !== area) continue;
      const stateObj = this.hass.states[entityId];
      const deviceClass = stateObj?.attributes?.device_class;
      if (typeof deviceClass === "string" && want.includes(deviceClass)) {
        return entityId;
      }
    }
    return undefined;
  }

  // --- Service helpers ------------------------------------------------------

  private _setLightBrightness(entityId: string, pct: number): void {
    if (pct <= 0) {
      this.hass?.callService("light", "turn_off", { entity_id: entityId });
    } else {
      this.hass?.callService("light", "turn_on", {
        entity_id: entityId,
        brightness_pct: Math.round(pct),
      });
    }
  }

  private _setVolume(entityId: string, pct: number): void {
    this.hass?.callService("media_player", "volume_set", {
      entity_id: entityId,
      volume_level: Math.max(0, Math.min(1, pct / 100)),
    });
  }

  private _toggleMute(entityId: string): void {
    const muted = this.hass?.states[entityId]?.attributes?.is_volume_muted === true;
    this.hass?.callService("media_player", "volume_mute", {
      entity_id: entityId,
      is_volume_muted: !muted,
    });
  }

  // --- Slider models --------------------------------------------------------

  private _brightnessModel(entityId: string): SliderModel {
    const stateObj = this.hass?.states[entityId];
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

  private _volumeModel(entityId: string): SliderModel {
    const stateObj = this.hass?.states[entityId];
    // Disabled (greyed, not clickable) when the player is off/standby/unavailable.
    const available = !!stateObj && !VOLUME_OFF_STATES.has(stateObj.state);
    const pct = Math.round(num(stateObj?.attributes?.volume_level, 0) * 100);
    const muted = stateObj?.attributes?.is_volume_muted === true;
    return { min: 0, max: 100, step: 1, value: pct, unit: "%", kind: "volume", muted, available };
  }

  // --- Status items ---------------------------------------------------------

  private _formatSensor(
    stateObj: HomeAssistant["states"][string] | undefined,
    type: "temperature" | "occupancy",
  ): string {
    if (!stateObj) return "—";
    if (type === "occupancy") {
      if (stateObj.state === "on") return "Detected";
      if (stateObj.state === "off") return "Clear";
    }
    const unit = stateObj.attributes?.unit_of_measurement as string | undefined;
    return unit ? `${stateObj.state} ${unit}` : capitalize(stateObj.state);
  }

  private _renderSensorItem(item: RoomSensorStatusItem): TemplateResult {
    const entityId = item.entity ?? this._resolveAreaEntity(item.type);
    const stateObj = entityId ? this.hass?.states[entityId] : undefined;
    const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON[item.type];
    const label = String(item.name ?? stateObj?.attributes?.friendly_name ?? entityId ?? "");
    return html`
      <div class="status-item" title=${label}>
        <ha-icon class="status-icon" .icon=${icon}></ha-icon>
        <span class="status-text">${this._formatSensor(stateObj, item.type)}</span>
      </div>
    `;
  }

  private _ledColor(item: RoomLedStatusItem, stateObj?: HomeAssistant["states"][string]): string {
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

  private _renderLedItem(item: RoomLedStatusItem): TemplateResult {
    const stateObj = this.hass?.states[item.entity];
    const color = this._ledColor(item, stateObj);
    const label = String(item.name ?? stateObj?.attributes?.friendly_name ?? item.entity);
    return html`
      <span
        class="status-led"
        style=${styleMap({ background: color, boxShadow: `0 0 6px ${color}` })}
        title=${label}
      ></span>
    `;
  }

  private _renderBrightnessItem(
    item: Extract<RoomStatusItem, { type: "brightness" }>,
    index: number,
  ): TemplateResult {
    const model = this._brightnessModel(item.entity);
    const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.brightness;
    const anchorId = `rc-bri-anchor-${index}`;
    const popId = `rc-bri-pop-${index}`;
    return html`
      <button
        id=${anchorId}
        class="status-icon-button"
        popovertarget=${popId}
        ?disabled=${!model.available}
        title=${String(item.name ?? "Brightness")}
        aria-label="Brightness"
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>
      ${this._renderSliderPopover(popId, anchorId, `bri-${index}`, item, model, icon)}
    `;
  }

  private _renderVolumeItem(
    item: Extract<RoomStatusItem, { type: "volume" }>,
    index: number,
  ): TemplateResult {
    const model = this._volumeModel(item.entity);
    const icon = item.icon ?? STATUS_ITEM_DEFAULT_ICON.volume;
    const anchorId = `rc-vol-anchor-${index}`;
    const popId = `rc-vol-pop-${index}`;
    return html`
      <button
        id=${anchorId}
        class=${classMap({ "status-icon-button": true, "is-active": model.muted })}
        ?disabled=${!model.available}
        @click=${() => this._onVolumeAnchorClick(index, item.entity)}
        title="Volume — double-tap to mute"
        aria-label="Volume"
      >
        <ha-icon .icon=${model.muted ? "mdi:volume-off" : icon}></ha-icon>
      </button>
      ${this._renderSliderPopover(popId, anchorId, `vol-${index}`, item, model, icon)}
    `;
  }

  private _renderSliderPopover(
    popId: string,
    anchorId: string,
    key: string,
    item: RoomStatusItem,
    model: SliderModel,
    icon: string,
  ): TemplateResult {
    const live = this._activeSlider?.key === key ? this._activeSlider.value : model.value;
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
        @toggle=${this._onPopoverToggle}
      >
        <span class="slider-popover-value">${readout}</span>
        <input
          class=${classMap({ "rc-slider": true, "is-muted": model.muted })}
          type="range"
          orient="vertical"
          min=${model.min}
          max=${model.max}
          step=${model.step}
          style=${`--ted-style-fill:${fill}%`}
          .value=${String(live)}
          ?disabled=${!model.available}
          aria-label=${item.type === "volume" ? "Volume" : "Brightness"}
          @input=${(ev: Event) => this._onSliderInput(ev, key)}
          @change=${(ev: Event) => this._onSliderChange(ev, item)}
        />
        <ha-icon class="slider-popover-icon" .icon=${icon}></ha-icon>
      </div>
    `;
  }

  private _renderStatusItem(item: RoomStatusItem, index: number): TemplateResult {
    switch (item.type) {
      case "temperature":
      case "occupancy":
        return this._renderSensorItem(item);
      case "brightness":
        return this._renderBrightnessItem(item, index);
      case "volume":
        return this._renderVolumeItem(item, index);
      case "led":
        return this._renderLedItem(item);
    }
  }

  // --- Slider / volume interaction -----------------------------------------

  private _onSliderInput(ev: Event, key: string): void {
    const value = num((ev.target as HTMLInputElement).value, Number.NaN);
    if (!Number.isFinite(value)) return;
    this._activeSlider = { key, value };
  }

  private _onSliderChange(ev: Event, item: RoomStatusItem): void {
    const value = num((ev.target as HTMLInputElement).value, Number.NaN);
    this._activeSlider = undefined;
    if (!Number.isFinite(value)) return;
    if (item.type === "brightness") {
      const domain = item.entity.split(".")[0];
      if (domain === "light") {
        this._setLightBrightness(item.entity, value);
      } else {
        this.hass?.callService(domain, "set_value", { entity_id: item.entity, value });
      }
    } else if (item.type === "volume") {
      this._setVolume(item.entity, value);
    }
  }

  private _onVolumeAnchorClick(index: number, entityId: string): void {
    if (this._volumeClickTimer !== undefined) {
      window.clearTimeout(this._volumeClickTimer);
      this._volumeClickTimer = undefined;
      this._toggleMute(entityId);
      return;
    }
    this._volumeClickTimer = window.setTimeout(() => {
      this._volumeClickTimer = undefined;
      this._openVolumePopover(index);
    }, VOLUME_DOUBLE_TAP_MS);
  }

  private _openVolumePopover(index: number): void {
    const root = this.renderRoot as ShadowRoot;
    const popover = root.getElementById(`rc-vol-pop-${index}`) as
      | (HTMLElement & { showPopover?: () => void })
      | null;
    if (!popover || popover.matches(":popover-open")) return;
    if (Date.now() - this._volumeClosedAt < 350) return;
    popover.showPopover?.();
  }

  private _onPopoverToggle = (ev: Event): void => {
    const popover = ev.currentTarget as HTMLElement;
    const newState = (ev as Event & { newState?: string }).newState;
    if (newState === "open") {
      const anchorId = popover.dataset.anchor;
      const anchor = anchorId ? (this.renderRoot as ShadowRoot).getElementById(anchorId) : null;
      this._positionPopover(popover, anchor ?? undefined);
      return;
    }
    if (popover.id.startsWith("rc-vol-")) {
      this._volumeClosedAt = Date.now();
    }
    if (this._activeSlider) {
      this._activeSlider = undefined;
    }
  };

  /** Pin a popover to the bottom-right of its anchor, flipping above when needed. */
  private _positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.margin = "0";
    if (!anchor) {
      popover.style.left = `${Math.round((window.innerWidth - rect.width) / 2)}px`;
      popover.style.top = `${Math.round((window.innerHeight - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    let left = a.right - rect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    let top = a.bottom + margin;
    if (top + rect.height > window.innerHeight - margin && a.top - margin - rect.height >= margin) {
      top = a.top - margin - rect.height;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  // --- Button sections ------------------------------------------------------

  private _renderButtonCell(sIdx: number, bIdx: number): TemplateResult {
    const entry = this._buttonEls.get(`${sIdx}:${bIdx}`);
    return html`
      <div class="button-cell">
        ${entry ? entry.el : html`<div class="button-cell__placeholder"></div>`}
      </div>
    `;
  }

  private _renderOverflowCell(sIdx: number, total: number, fromIdx: number): TemplateResult {
    const anchorId = `rc-of-anchor-${sIdx}`;
    const popId = `rc-of-pop-${sIdx}`;
    const hidden: TemplateResult[] = [];
    for (let bIdx = fromIdx; bIdx < total; bIdx += 1) {
      hidden.push(this._renderButtonCell(sIdx, bIdx));
    }
    return html`
      <button
        id=${anchorId}
        class="button-cell button-overflow"
        popovertarget=${popId}
        title="Show more"
        aria-label="Show more"
      >
        <ha-icon .icon=${"mdi:dots-horizontal"}></ha-icon>
      </button>
      <div
        id=${popId}
        class="overflow-popover"
        popover
        data-anchor=${anchorId}
        @toggle=${this._onPopoverToggle}
      >
        <div class="button-grid overflow-grid">${hidden}</div>
      </div>
    `;
  }

  private _renderSection(section: RoomButtonSection, sIdx: number): TemplateResult {
    const buttons = section.buttons ?? [];
    const maxRows = num(section.max_rows, 0);
    const maxVisible = maxRows > 0 ? maxRows * 5 : Number.POSITIVE_INFINITY;
    const overflow = buttons.length > maxVisible;
    const visibleCount = overflow ? maxVisible - 1 : buttons.length;
    return html`
      <div class="button-section">
        ${section.title ? html`<div class="section-title">${section.title}</div>` : nothing}
        <div class="button-grid">
          ${buttons
            .slice(0, visibleCount)
            .map((_button, bIdx) => this._renderButtonCell(sIdx, bIdx))}
          ${overflow ? this._renderOverflowCell(sIdx, buttons.length, visibleCount) : nothing}
        </div>
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClasses = {
      "ted-card": true,
      "ted-card--theme-ted-style": themeMode === "ted-style",
      "ted-card--theme-ha": themeMode === "ha",
    };

    const title = this._config.name || this._areaName();
    const statusItems = this._config.status_items ?? [];
    const sections = this._config.sections ?? [];
    const hasBody = sections.length > 0;

    return html`
      <ha-card class=${classMap(themeClasses)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        <div class="status-bar">
          ${title ? html`<div class="status-title">${title}</div>` : nothing}
          <div class="status-items">
            ${statusItems.map((item, index) => this._renderStatusItem(item, index))}
          </div>
        </div>
        ${hasBody
          ? html`<div class="sections">
              ${sections.map((section, sIdx) => this._renderSection(section, sIdx))}
            </div>`
          : statusItems.length === 0
            ? html`<div class="placeholder">Add status items and button sections in the editor.</div>`
            : nothing}
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
        isolation: isolate;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
        color: var(--ted-style-text);
      }

      /* Status strip (pinned to the top edge). */
      .status-bar {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 24px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--ted-style-divider);
      }
      .status-title {
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status-items {
        display: inline-flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        min-width: 0;
      }
      .status-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--ted-style-text);
        white-space: nowrap;
      }
      .status-icon {
        --mdc-icon-size: 16px;
        color: var(--ted-style-muted);
        flex: none;
      }
      .status-text {
        color: var(--ted-style-text);
      }
      .status-led {
        flex: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .status-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--ted-style-muted);
        cursor: pointer;
        transition: color 0.18s ease, background 0.18s ease, transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .status-icon-button ha-icon {
        --mdc-icon-size: 18px;
      }
      .status-icon-button:hover {
        color: var(--ted-style-text);
      }
      .status-icon-button:active {
        transform: scale(0.9);
      }
      .status-icon-button:focus-visible {
        outline: 2px solid var(--ted-style-accent);
        outline-offset: 2px;
      }
      .status-icon-button:disabled {
        opacity: 0.4;
        pointer-events: none;
      }
      .status-icon-button.is-active {
        color: var(--ted-style-danger);
      }

      /* Slider popover (brightness / volume). */
      .slider-popover {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 14px 12px;
        background: var(--ted-style-surface);
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      }
      .slider-popover:popover-open {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .slider-popover::backdrop {
        background: transparent;
      }
      .slider-popover-value {
        color: var(--ted-style-text);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .slider-popover-icon {
        --mdc-icon-size: 18px;
        color: var(--ted-style-muted);
      }
      .rc-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 28px;
        height: 150px;
        margin: 0;
        background: transparent;
        direction: rtl;
        writing-mode: vertical-lr;
      }
      .rc-slider::-webkit-slider-runnable-track {
        width: 6px;
        border-radius: var(--ted-style-pill);
        background: linear-gradient(
          to top,
          var(--ted-style-accent) 0%,
          var(--ted-style-accent) var(--ted-style-fill, 50%),
          color-mix(in srgb, var(--ted-style-text) 18%, transparent) var(--ted-style-fill, 50%),
          color-mix(in srgb, var(--ted-style-text) 18%, transparent) 100%
        );
      }
      .rc-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 22px;
        height: 22px;
        margin-left: -8px;
        border-radius: 50%;
        background: var(--ted-style-surface);
        border: 1px solid color-mix(in srgb, var(--ted-style-text) 20%, transparent);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }
      .rc-slider::-moz-range-track {
        width: 6px;
        border-radius: var(--ted-style-pill);
        background: color-mix(in srgb, var(--ted-style-text) 18%, transparent);
      }
      .rc-slider::-moz-range-progress {
        width: 6px;
        border-radius: var(--ted-style-pill);
        background: var(--ted-style-accent);
      }
      .rc-slider::-moz-range-thumb {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--ted-style-surface);
        border: 1px solid color-mix(in srgb, var(--ted-style-text) 20%, transparent);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      }
      .rc-slider:disabled {
        opacity: 0.4;
        pointer-events: none;
      }
      .rc-slider.is-muted {
        opacity: 0.55;
      }

      /* Button sections. */
      .sections {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .button-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .section-title {
        color: var(--ted-style-muted);
        font-size: 0.95rem;
        font-weight: 500;
      }
      .button-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
      }
      .button-cell {
        position: relative;
        aspect-ratio: 1 / 1;
        min-width: 0;
      }
      .button-cell > * {
        display: block;
        width: 100%;
        height: 100%;
      }
      .button-cell__placeholder {
        width: 100%;
        height: 100%;
        border-radius: var(--ted-style-radius-sm);
        background: color-mix(in srgb, var(--ted-style-surface-2) 60%, transparent);
      }
      .button-overflow {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        background-color: var(--ted-style-surface);
        background-image: linear-gradient(var(--ted-style-surface-2), var(--ted-style-surface-2));
        color: var(--ted-style-muted);
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease, transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .button-overflow ha-icon {
        --mdc-icon-size: 26px;
      }
      .button-overflow:hover {
        color: var(--ted-style-text);
        border-color: color-mix(in srgb, var(--ted-style-accent) 50%, var(--ted-style-divider));
      }
      .button-overflow:active {
        transform: scale(0.96);
      }
      .button-overflow:focus-visible {
        outline: 2px solid var(--ted-style-accent);
        outline-offset: 2px;
      }
      .overflow-popover {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 10px;
        background: var(--ted-style-surface);
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      }
      .overflow-popover::backdrop {
        background: transparent;
      }
      .overflow-grid {
        grid-template-columns: repeat(4, 76px);
        max-width: 92vw;
      }

      .placeholder {
        position: relative;
        z-index: 1;
        color: var(--ted-style-muted);
        font-size: 14px;
      }
    `,
  ];
}
