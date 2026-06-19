import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  ROOM_CARD_DESCRIPTION,
  ROOM_CARD_EDITOR_TYPE,
  ROOM_CARD_NAME,
  ROOM_CARD_TYPE,
} from "./const";
import type { RoomCardConfig } from "./types";

/** Minimal shape of an area registry entry (not in custom-card-helpers' types). */
interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

/** Home Assistant exposes the area registry on `hass.areas` at runtime. */
type HassWithAreas = HomeAssistant & {
  areas?: Record<string, AreaRegistryEntry>;
};

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
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
    const areas = (hass as HassWithAreas).areas ?? {};
    const firstArea = Object.keys(areas)[0];
    return { area: firstArea ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: RoomCardConfig;

  public setConfig(config: RoomCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 12,
      rows: "auto",
      min_columns: 4,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    return changed.has("_config") || changed.has("layout") || changed.has("hass");
  }

  /** Resolve the configured area's display name (falls back to the raw id). */
  private _areaName(): string | undefined {
    const areaId = this._config?.area;
    if (!areaId) return undefined;
    const areas = (this.hass as HassWithAreas | undefined)?.areas;
    return areas?.[areaId]?.name ?? areaId;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClasses = {
      "ted-card": true,
      "ted-card--theme-ted-style": themeMode === "ted-style",
      "ted-card--theme-ha": themeMode === "ha",
    };

    const areaName = this._areaName();
    const title = this._config.name || areaName;

    if (!this._config.area) {
      return html`
        <ha-card class=${classMap(themeClasses)}>
          ${this._config.brushed ? brushedOverlay : nothing}
          <div class="placeholder">Select an area in the card editor.</div>
        </ha-card>
      `;
    }

    return html`
      <ha-card class=${classMap(themeClasses)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        <div class="header">
          <span class="title">${title}</span>
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
        isolation: isolate;
        display: flex;
        flex-direction: column;
        padding: 12px;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
        color: var(--ted-style-text);
      }
      .header {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
      }
      .title {
        font-size: 18px;
        font-weight: 600;
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
