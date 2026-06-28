import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from "custom-card-helpers";

import { appearanceStyle } from "../../shared/appearance";
import { registerCustomCard } from "../../shared/register-card";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { renderStatusItem, type StatusItemContext } from "../../shared/status-items/render";
import { StatusSliderController } from "../../shared/status-items/slider-controller";
import { statusItemStyles } from "../../shared/status-items/styles";
import type { StatusItem } from "../../shared/status-items/types";
import {
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  NAVBAR_CARD_DESCRIPTION,
  NAVBAR_CARD_EDITOR_TYPE,
  NAVBAR_CARD_NAME,
  NAVBAR_CARD_TYPE,
} from "./const";
import { detectEditOrPreview, forceNavbarPadding, removeNavbarPadding } from "./navbar-dom";
import type { NavButtonConfig, NavItem, NavSection, NavZone, NavbarCardConfig } from "./types";

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}
declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

interface ButtonEntry {
  el: LovelaceCard;
  json: string;
}

const ZONES: NavZone[] = ["left", "center", "right"];

registerCustomCard({
  type: NAVBAR_CARD_TYPE,
  name: NAVBAR_CARD_NAME,
  description: NAVBAR_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#navbar-card",
});

@customElement(NAVBAR_CARD_TYPE)
export class TedNavbarCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-navbar-card-editor");
    return document.createElement(NAVBAR_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<NavbarCardConfig, "type"> {
    return {
      sections: [
        {
          placement: "center",
          align: "center",
          buttons: [
            {
              type: "custom:ted-label-button-card",
              name: "Home",
              icon: "mdi:home",
              theme: "ha",
              neumorphic: false,
              transparency: 100,
            },
          ],
        },
      ],
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: NavbarCardConfig;

  private _helpers?: CardHelpers;
  private _buttonEls = new Map<string, ButtonEntry>();
  private _editMode = false;
  /** Shared controller for status-item brightness/volume popovers. */
  private _slider = new StatusSliderController(this);
  /** Interval id that re-renders live time/date items. */
  private _clockTimer?: number;

  public setConfig(config: NavbarCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (this._helpers) this._buildButtonElements();
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions() {
    return { columns: "full", rows: 1, min_rows: 1, max_rows: 1 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._editMode = detectEditOrPreview(this);
    void this._loadHelpers();
    this._applyPadding();
    this._syncClockTimer();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    removeNavbarPadding();
    if (this._clockTimer !== undefined) {
      window.clearInterval(this._clockTimer);
      this._clockTimer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) {
      this._buildButtonElements();
      this._applyPadding();
      this._syncClockTimer();
    }
    if (changed.has("hass")) this._propagateHass();
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildButtonElements();
    this.requestUpdate();
  }

  private _thickness(): number {
    return typeof this._config?.size === "number" ? this._config.size : DEFAULT_NAVBAR_SIZE;
  }

  private _alignment(): "top" | "bottom" {
    return this._config?.alignment === "top" ? "top" : "bottom";
  }

  private _barType(): "snap" | "float" {
    return this._config?.bar_type === "float" ? "float" : "snap";
  }

  private _minWidth(): number {
    return typeof this._config?.min_width === "number" ? this._config.min_width : DEFAULT_NAVBAR_MIN_WIDTH;
  }

  private _maxWidth(): number {
    return typeof this._config?.max_width === "number" ? this._config.max_width : DEFAULT_NAVBAR_MAX_WIDTH;
  }

  /** Reserve view padding so dashboard content isn't hidden under the bar. */
  private _applyPadding(): void {
    const margin = this._barType() === "float" ? 16 : 0;
    forceNavbarPadding({
      alignment: this._alignment(),
      px: this._thickness() + margin,
      enabled: !this._editMode,
    });
  }

  /** (Re)build cached embedded button cards, reusing those whose config is unchanged. */
  private _buildButtonElements(): void {
    if (!this._helpers || !this._config) return;
    const next = new Map<string, ButtonEntry>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      this._sectionItems(section).forEach((item, idx) => {
        if (!this._isButton(item)) return;
        const key = `${sIdx}:${idx}`;
        const cardConfig = this._buttonCardConfig(item);
        const json = JSON.stringify(cardConfig);
        const existing = this._buttonEls.get(key);
        if (existing && existing.json === json) {
          next.set(key, existing);
          return;
        }
        const el = this._helpers!.createCardElement(cardConfig);
        // Render buttons as grid items so the embedded card fills its cell.
        (el as unknown as { layout?: string }).layout = "grid";
        if (this.hass) el.hass = this.hass;
        next.set(key, { el, json });
      });
    });
    this._buttonEls = next;
  }

  /** Strip the nav-only sizing key so the embedded label-button card stays clean. */
  private _buttonCardConfig(button: NavButtonConfig): LovelaceCardConfig {
    const { nav_button_size, ...cardConfig } = button;
    void nav_button_size;
    return cardConfig as LovelaceCardConfig;
  }

  /** A section's ordered items, falling back to the legacy buttons-only list. */
  private _sectionItems(section: NavSection): NavItem[] {
    return section.items ?? section.buttons ?? [];
  }

  /** A nav item is a button when its `type` is an embeddable `custom:` card. */
  private _isButton(item: NavItem): item is NavButtonConfig {
    return typeof item.type === "string" && item.type.startsWith("custom:");
  }

  /** Re-render once a second while any live time/date item is present. */
  private _syncClockTimer(): void {
    const ticking = (this._config?.sections ?? [])
      .flatMap((s) => this._sectionItems(s))
      .some((i) => i.type === "time" || i.type === "date");
    if (ticking && this._clockTimer === undefined) {
      this._clockTimer = window.setInterval(() => this.requestUpdate(), 1000);
    } else if (!ticking && this._clockTimer !== undefined) {
      window.clearInterval(this._clockTimer);
      this._clockTimer = undefined;
    }
  }

  private _lastPropagatedHass?: HomeAssistant;
  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    for (const entry of this._buttonEls.values()) entry.el.hass = this.hass;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const theme = this._config.theme === "ted-style" ? "ted-style" : "ha";
    const cardStyle: Record<string, string> = appearanceStyle({
      transparency: this._config.transparency ?? 100,
      blur: this._config.blur,
    });
    if (this._barType() === "float") {
      cardStyle["min-width"] = `${this._minWidth()}px`;
      cardStyle["max-width"] = `${this._maxWidth()}px`;
    }
    const sections = this._config.sections ?? [];
    const byZone: Record<NavZone, Array<{ section: NavSection; idx: number }>> = {
      left: [],
      center: [],
      right: [],
    };
    sections.forEach((section, idx) => {
      if (section.visible === false) return;
      const zone = ZONES.includes(section.placement as NavZone)
        ? (section.placement as NavZone)
        : "left";
      byZone[zone].push({ section, idx });
    });

    // Center-only float bars shrink to fit their buttons; bars with left/right
    // items stay full width so those items can pin to the edges.
    const hasSides =
      byZone.left.some(({ section }) => this._sectionItems(section).length > 0) ||
      byZone.right.some(({ section }) => this._sectionItems(section).length > 0);
    const hug = this._barType() === "float" && !hasSides;

    const navClasses = {
      navbar: true,
      [this._alignment()]: true,
      [this._barType()]: true,
      "edit-mode": this._editMode,
    };

    return html`
      <div
        class=${classMap(navClasses)}
        style=${styleMap({ "--nav-size": `${this._thickness()}px` })}
      >
        <ha-card class="navbar-card ${tedCardThemeClass(theme)}${hug ? " hug" : ""}" style=${styleMap(cardStyle)}>
          ${ZONES.map(
            (zone) => html`
              <div class="zone ${zone}">
                ${byZone[zone].map(({ section, idx }) => this._renderSection(section, idx))}
              </div>
            `,
          )}
        </ha-card>
      </div>
    `;
  }

  private _renderSection(section: NavSection, sIdx: number): TemplateResult {
    const align = section.align ?? "center";
    return html`
      <div class="section align-${align}">
        ${this._sectionItems(section).map((item, idx) =>
          this._isButton(item)
            ? this._renderButton(sIdx, idx, item)
            : this._renderStatusItem(item as StatusItem, sIdx, idx),
        )}
      </div>
    `;
  }

  private _renderButton(sIdx: number, idx: number, button: NavButtonConfig): TemplateResult {
    const entry = this._buttonEls.get(`${sIdx}:${idx}`);
    const wide = button.nav_button_size === "wide";
    return html`<div class="nav-button ${wide ? "wide" : ""}">${entry ? entry.el : nothing}</div>`;
  }

  private _renderStatusItem(item: StatusItem, sIdx: number, idx: number): TemplateResult {
    if (!this.hass) return html`<div class="nav-status"></div>`;
    const ctx: StatusItemContext = {
      hass: this.hass,
      slider: this._slider,
      keyPrefix: `nav-${sIdx}`,
    };
    return html`<div class="nav-status">${renderStatusItem(item, ctx, idx)}</div>`;
  }

  static styles = [
    tedStyleTheme,
    statusItemStyles,
    css`
      :host {
        display: block;
      }

      .navbar {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 5;
        pointer-events: none;
        box-sizing: border-box;
      }
      .navbar.bottom {
        bottom: 0;
      }
      .navbar.top {
        top: 0;
      }
      .navbar.float {
        padding: 8px;
      }
      /* In the editor / card picker preview, sit inline instead of overlaying. */
      .navbar.edit-mode {
        position: static;
      }

      .navbar-card {
        position: relative;
        pointer-events: auto;
        height: var(--nav-size);
        box-sizing: border-box;
        border-radius: 0;
        overflow: visible;
      }
      .navbar.float .navbar-card {
        margin: 0 auto;
        border-radius: var(--ted-style-radius, 12px);
      }
      /* Center-only float bars hug their content (just wider than the buttons),
         still capped by the configured min/max width. With left/right items the
         bar stays full width so those items can pin to the edges. */
      .navbar.float .navbar-card.hug {
        display: flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 0 12px;
      }
      .navbar.float .navbar-card.hug .zone.left,
      .navbar.float .navbar-card.hug .zone.right {
        display: none;
      }
      .navbar.float .navbar-card.hug .zone.center {
        position: static;
        transform: none;
      }

      /* Three zones: left pinned to the left edge, right to the right edge, and
         center pinned to the exact horizontal center (independent of side widths). */
      .zone {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .zone.left {
        left: 10px;
      }
      .zone.right {
        right: 10px;
      }
      .zone.center {
        left: 50%;
        transform: translateX(-50%);
      }

      .section {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 100%;
      }
      .section.align-left {
        justify-content: flex-start;
      }
      .section.align-center {
        justify-content: center;
      }
      .section.align-right {
        justify-content: flex-end;
      }

      .nav-button {
        height: calc(var(--nav-size) - 12px);
        width: calc(var(--nav-size) - 12px);
        flex: none;
      }
      .nav-button.wide {
        width: calc((var(--nav-size) - 12px) * 2 + 8px);
      }
      .nav-status {
        display: inline-flex;
        align-items: center;
        height: 100%;
        flex: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-navbar-card": TedNavbarCard;
  }
}
