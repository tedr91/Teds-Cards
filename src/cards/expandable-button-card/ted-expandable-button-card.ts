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

import { registerCustomCard } from "../../shared/register-card";
import { resolveIcon } from "../../shared/icons";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { BUTTON_CARD_TYPE } from "../button-card/const";
import {
  EXPANDABLE_BUTTON_CARD_DESCRIPTION,
  EXPANDABLE_BUTTON_CARD_EDITOR_TYPE,
  EXPANDABLE_BUTTON_CARD_NAME,
  EXPANDABLE_BUTTON_CARD_TYPE,
} from "./const";
import type { ExpandableButtonCardConfig, ExpandableChildConfig } from "./types";

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}
declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

interface CardEntry {
  el: LovelaceCard;
  json: string;
}

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

const POPOVER_ID = "ebc-popover";
const TRIGGER_ID = "ebc-trigger-btn";

/** Small "this is a group" glyph (Fluent when installed, else Material Design). */
const GROUP_BADGE_ICON = resolveIcon({ fluent: "group-20-regular", mdi: "group" }) ?? "mdi:group";

registerCustomCard({
  type: EXPANDABLE_BUTTON_CARD_TYPE,
  name: EXPANDABLE_BUTTON_CARD_NAME,
  description: EXPANDABLE_BUTTON_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#expandable-button-card",
});

@customElement(EXPANDABLE_BUTTON_CARD_TYPE)
export class TedExpandableButtonCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-expandable-button-card-editor");
    return document.createElement(EXPANDABLE_BUTTON_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<ExpandableButtonCardConfig, "type"> {
    return { name: "Menu", icon: "mdi:dots-horizontal", items: [] };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ExpandableButtonCardConfig;

  private _helpers?: CardHelpers;
  private _triggerEl?: CardEntry;
  private _childEls = new Map<string, CardEntry>();

  public setConfig(config: ExpandableButtonCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (this._helpers) this._buildElements();
  }

  public getCardSize(): number {
    return 2;
  }

  public getGridOptions(): GridOptions {
    return { columns: 3, rows: 2, min_columns: 2, min_rows: 1 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") && this._helpers) this._buildElements();
    if (changed.has("hass")) this._propagateHass();
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildElements();
    this.requestUpdate();
  }

  /** The trigger looks like a Button Card; its own tap/hold/double actions are disabled
   *  so a tap only opens the popup (the native popover invoker handles that). */
  private _triggerConfig(): LovelaceCardConfig {
    const { items, popup_layout, popup_max_columns, popup_title, popup_style, popup_item_size, ...rest } =
      this._config ?? {};
    void items;
    void popup_layout;
    void popup_max_columns;
    void popup_title;
    void popup_style;
    void popup_item_size;
    void (rest as { group_indicator?: boolean }).group_indicator;
    return {
      ...rest,
      type: `custom:${BUTTON_CARD_TYPE}`,
      tap_action: { action: "none" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    } as LovelaceCardConfig;
  }

  /** (Re)build the cached trigger + child card elements, reusing those whose config
   *  is unchanged (cheap re-render on state updates). */
  private _buildElements(): void {
    if (!this._helpers || !this._config) return;
    const triggerConfig = this._triggerConfig();
    const tJson = JSON.stringify(triggerConfig);
    if (!this._triggerEl || this._triggerEl.json !== tJson) {
      const el = this._helpers.createCardElement(triggerConfig);
      (el as unknown as { layout?: string }).layout = "grid";
      if (this.hass) el.hass = this.hass;
      this._triggerEl = { el, json: tJson };
    }
    const next = new Map<string, CardEntry>();
    (this._config.items ?? []).forEach((child, idx) => {
      const cardConfig = child as LovelaceCardConfig;
      const json = JSON.stringify(cardConfig);
      const key = String(idx);
      const existing = this._childEls.get(key);
      if (existing && existing.json === json) {
        next.set(key, existing);
        return;
      }
      const el = this._helpers!.createCardElement(cardConfig);
      (el as unknown as { layout?: string }).layout = "grid";
      if (this.hass) el.hass = this.hass;
      next.set(key, { el, json });
    });
    this._childEls = next;
  }

  private _lastPropagatedHass?: HomeAssistant;
  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    if (this._triggerEl) this._triggerEl.el.hass = this.hass;
    for (const entry of this._childEls.values()) entry.el.hass = this.hass;
  }

  private _isExpandable(child: ExpandableChildConfig): boolean {
    return child.type === `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const theme = this._config.theme === "ted-style" ? "ted-style" : "ha";
    const layout = this._config.popup_layout === "list" ? "list" : "grid";
    const items = this._config.items ?? [];
    // Grid columns size to the number of buttons (single row) unless a max is set.
    const maxCols =
      typeof this._config.popup_max_columns === "number" && this._config.popup_max_columns > 0
        ? this._config.popup_max_columns
        : undefined;
    const cols = Math.max(1, maxCols ? Math.min(maxCols, items.length) : items.length);
    const flip = this._config.flip_icon !== false;
    return html`
      <button
        id=${TRIGGER_ID}
        class=${classMap({ "ebc-trigger": true, "flip-icon": flip })}
        popovertarget=${POPOVER_ID}
        aria-haspopup="true"
      >
        ${this._triggerEl ? this._triggerEl.el : nothing}
        ${this._config.group_indicator
          ? html`<ha-icon class="ebc-group-badge" .icon=${GROUP_BADGE_ICON}></ha-icon>`
          : nothing}
      </button>
      <div
        id=${POPOVER_ID}
        class="ebc-popover ${tedCardThemeClass(theme)}"
        popover
        style=${styleMap({
          "--ebc-cols": String(cols),
          ...(this._config.popup_item_size ? { "--ebc-cell": `${this._config.popup_item_size}px` } : {}),
          ...(this._config.popup_style ?? {}),
        })}
        @toggle=${this._onPopoverToggle}
        @click=${this._onPopoverBodyClick}
      >
        ${this._config.popup_title
          ? html`<div class="ebc-popover-title">${this._config.popup_title}</div>`
          : nothing}
        <div class=${classMap({ "ebc-popover-body": true, [layout]: true })}>
          ${items.map((child, idx) => {
            const entry = this._childEls.get(String(idx));
            const expandable = this._isExpandable(child);
            return html`<div
              class=${classMap({ "ebc-cell": true, expandable })}
              ?data-expandable=${expandable}
              title=${(child as { name?: string }).name || nothing}
            >
              ${entry ? entry.el : nothing}
            </div>`;
          })}
        </div>
      </div>
    `;
  }

  /** Position the popover over its trigger when it opens; flip the trigger icon while open. */
  private _onPopoverToggle = (ev: Event): void => {
    const popover = ev.currentTarget as HTMLElement;
    const open = (ev as Event & { newState?: string }).newState === "open";
    const trigger = (this.renderRoot as ShadowRoot).getElementById(TRIGGER_ID);
    if (open) {
      this._positionPopover(popover, trigger ?? undefined);
      if (this._config?.flip_icon !== false) trigger?.style.setProperty("--ted-icon-rotate", "180deg");
    } else {
      trigger?.style.removeProperty("--ted-icon-rotate");
    }
  };

  private _positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    popover.style.position = "fixed";
    popover.style.margin = "0";
    if (!anchor) {
      popover.style.left = `${Math.round((vw - rect.width) / 2)}px`;
      popover.style.top = `${Math.round((vh - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    let left = a.left + a.width / 2 - rect.width / 2;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    const fitsBelow = a.bottom + margin + rect.height <= vh - margin;
    const fitsAbove = a.top - margin - rect.height >= margin;
    let top = a.bottom + margin;
    if (!fitsBelow && fitsAbove) top = a.top - margin - rect.height;
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  /** Close the popup after a leaf child is tapped. A nested Expandable Button Card
   *  child opens its own popover (native nesting keeps this one open), so skip it. */
  private _onPopoverBodyClick = (ev: Event): void => {
    const target = ev.target as HTMLElement | null;
    const cell = target?.closest(".ebc-cell");
    if (!cell || cell.hasAttribute("data-expandable")) return;
    const popover = (this.renderRoot as ShadowRoot).getElementById(POPOVER_ID) as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    popover?.hidePopover?.();
  };

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }

      /* The trigger fills the card; clicking it opens the native popover. */
      .ebc-trigger {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      /* Small corner glyph marking the trigger as a group of buttons. */
      .ebc-group-badge {
        position: absolute;
        right: 1px;
        bottom: 1px;
        z-index: 2;
        --mdc-icon-size: 13px;
        color: var(--ted-style-accent);
        pointer-events: none;
        filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.55));
      }
      .ebc-trigger > * {
        display: block;
        width: 100%;
        height: 100%;
      }
      /* Flip the trigger icon while the popup is open. The custom property inherits into
         the embedded Button Card's shadow DOM, rotating just its icon (e.g. a chevron). */
      .ebc-trigger.flip-icon:has(+ .ebc-popover:popover-open) {
        --ted-icon-rotate: 180deg;
      }

      /* Native popover holding the child buttons. Opt into the theme's card frost so on
         translucent themes the surface blurs the dashboard behind it. */
      .ebc-popover {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 12px;
        background: var(--ted-style-surface);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
        max-width: 92vw;
        max-height: 80vh;
        overflow: auto;
      }
      .ebc-popover::backdrop {
        background: transparent;
      }
      .ebc-popover-title {
        color: var(--ted-style-muted, var(--secondary-text-color));
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0 2px 10px;
      }
      .ebc-popover-body.grid {
        display: grid;
        grid-template-columns: repeat(var(--ebc-cols, 1), var(--ebc-cell, 76px));
        gap: 8px;
      }
      .ebc-popover-body.list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ebc-cell {
        width: var(--ebc-cell, 76px);
        height: var(--ebc-cell, 76px);
      }
      .ebc-popover-body.list .ebc-cell {
        width: 220px;
        height: 56px;
      }
      .ebc-cell > * {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-expandable-button-card": TedExpandableButtonCard;
  }
}
