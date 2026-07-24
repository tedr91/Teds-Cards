import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { SettingsController, settingsStore } from "../../shared/settings";
import { resolveIcon } from "../../shared/icons";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import {
  EXPAND_ICON,
  FULLSCREEN_CARD_DESCRIPTION,
  FULLSCREEN_CARD_EDITOR_TYPE,
  FULLSCREEN_CARD_NAME,
  FULLSCREEN_CARD_TYPE,
  FULLSCREEN_STATES_KEY,
  MINIMIZE_ICON,
} from "./const";
import type { FullscreenCardConfig } from "./types";

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

const OVERLAY_ID = "fs-overlay";

registerCustomCard({
  type: FULLSCREEN_CARD_TYPE,
  name: FULLSCREEN_CARD_NAME,
  description: FULLSCREEN_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#fullscreen-card",
});

@customElement(FULLSCREEN_CARD_TYPE)
export class TedFullscreenCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-fullscreen-card-editor");
    return document.createElement(FULLSCREEN_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<FullscreenCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: FullscreenCardConfig;
  /** Whether the housed card is currently shown full-screen. */
  @state() private _maximized = false;

  private _helpers?: CardHelpers;
  private _child?: CardEntry;
  private _lastPropagatedHass?: HomeAssistant;
  /** True once the initial state has been resolved from the backend store. */
  private _stateResolved = false;

  public constructor() {
    super();
    // Only feed/subscribe the backend settings store when the card opts in;
    // card-only use stays fully self-contained (getHass returns undefined).
    new SettingsController(this, () => (this._config?.backend_integration ? this.hass : undefined));
  }

  public setConfig(config: FullscreenCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    // Without the backend, the state is purely local: seed it from the config.
    if (!config.backend_integration) {
      this._maximized = config.start_maximized === true;
      this._stateResolved = true;
    } else {
      // Re-resolve from the store once it has (re)loaded for this new config.
      this._stateResolved = false;
    }
    if (this._helpers) this._buildChild();
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): GridOptions {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // Return the overlay to the closed state so a re-mount starts clean.
    this._closeOverlay();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) this._buildChild();
    if (changed.has("hass")) this._propagateHass();
  }

  protected updated(): void {
    this._resolveInitialState();
    this._syncOverlay();
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildChild();
    this.requestUpdate();
  }

  /** (Re)build the single housed card, reusing it when its config is unchanged. */
  private _buildChild(): void {
    if (!this._helpers || !this._config) return;
    const cardConfig = this._config.card;
    if (!cardConfig) {
      this._child = undefined;
      return;
    }
    const json = JSON.stringify(cardConfig);
    if (this._child && this._child.json === json) return;
    const el = this._helpers.createCardElement(cardConfig);
    (el as unknown as { layout?: string }).layout = "grid";
    if (this.hass) el.hass = this.hass;
    this._child = { el, json };
    this._lastPropagatedHass = this.hass;
  }

  private _propagateHass(): void {
    if (this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    if (this._child) this._child.el.hass = this.hass;
  }

  // ── State (backend persistence) ──────────────────────────────────────────

  /** The saved `{ state_key: maximized }` map for this device. */
  private _stateMap(): Record<string, boolean> {
    const v = settingsStore.deviceSettings()[FULLSCREEN_STATES_KEY];
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  }

  /** Resolve the initial maximized state from the store, once, when opted in. */
  private _resolveInitialState(): void {
    if (this._stateResolved || !this._config?.backend_integration) return;
    if (!settingsStore.hasLoaded()) return;
    const key = this._config.state_key;
    const saved = key ? this._stateMap()[key] : undefined;
    this._maximized = typeof saved === "boolean" ? saved : this._config.start_maximized === true;
    this._stateResolved = true;
  }

  /** Persist the current state to the backend (when opted in with a `state_key`). */
  private _persist(maximized: boolean): void {
    const key = this._config?.state_key;
    if (!this._config?.backend_integration || !key) return;
    settingsStore.setValue("device", FULLSCREEN_STATES_KEY, {
      ...this._stateMap(),
      [key]: maximized,
    });
  }

  private _toggle = (): void => {
    this._maximized = !this._maximized;
    this._persist(this._maximized);
  };

  // ── Overlay (top-layer popover) ──────────────────────────────────────────

  private _overlayEl(): (HTMLElement & { showPopover?: () => void; hidePopover?: () => void }) | null {
    return (this.renderRoot as ShadowRoot).getElementById(OVERLAY_ID) as
      | (HTMLElement & { showPopover?: () => void; hidePopover?: () => void })
      | null;
  }

  /** Open/close the popover to match `_maximized`. */
  private _syncOverlay(): void {
    const el = this._overlayEl();
    if (!el) return;
    const open = el.matches(":popover-open");
    if (this._maximized && !open) {
      try {
        el.showPopover?.();
      } catch {
        /* already open / not supported */
      }
    } else if (!this._maximized && open) {
      this._closeOverlay();
    }
  }

  private _closeOverlay(): void {
    const el = this._overlayEl();
    if (el && el.matches(":popover-open")) {
      try {
        el.hidePopover?.();
      } catch {
        /* not open */
      }
    }
  }

  /** Inline sizing for the overlay. Empty (CSS-driven) unless the backend is on. */
  private _overlayStyle(): Record<string, string> {
    if (!this._config?.backend_integration) return {};
    const eff = settingsStore.effective();
    const pos = String(eff.navbar_position ?? "bottom");
    const size = Number(eff.navbar_size ?? 48);
    const float = eff.navbar_float === true;
    const autoHide = eff.navbar_auto_hide === true;
    // When auto-hide is on the bar collapses to a slim pill, so we can size fully
    // under it; otherwise reserve the bar thickness (+ a float margin) on its edge.
    const bar = autoHide ? "0px" : `${size + (float && (pos === "bottom" || pos === "top") ? 16 : 0)}px`;
    const safe = (edge: string): string => `env(safe-area-inset-${edge})`;
    const style: Record<string, string> = {
      top: pos === "top" ? bar : `max(${safe("top")}, var(--ted-navbar-header-reserve, 0px))`,
      bottom: pos === "bottom" ? bar : safe("bottom"),
      left: pos === "left" ? bar : safe("left"),
      right: pos === "right" ? bar : safe("right"),
    };
    // Cap the overlay to this device's known screen size (a guard; usually a no-op).
    const reg = settingsStore.registry()[settingsStore.deviceId];
    if (reg?.client_width) style["max-width"] = `${reg.client_width}px`;
    if (reg?.client_height) style["max-height"] = `${reg.client_height}px`;
    return style;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private _expandIcon(): string {
    return this._config?.expand_icon ?? resolveIcon(EXPAND_ICON) ?? "mdi:arrow-expand";
  }

  private _minimizeIcon(): string {
    return this._config?.minimize_icon ?? resolveIcon(MINIMIZE_ICON) ?? "mdi:arrow-collapse";
  }

  /** The corner toggle button. `maximized` selects the icon + label. */
  private _renderToggle(maximized: boolean): TemplateResult {
    return html`<button
      type="button"
      class="fs-toggle"
      title=${maximized ? "Restore" : "Full screen"}
      aria-label=${maximized ? "Restore" : "Full screen"}
      @click=${this._toggle}
    >
      <ha-icon .icon=${maximized ? this._minimizeIcon() : this._expandIcon()}></ha-icon>
    </button>`;
  }

  private _renderEmpty(): TemplateResult {
    const title = this._config?.empty_title ?? "No card configured";
    const message = this._config?.empty_message ?? "Add a card to this Fullscreen card.";
    return html`<div class="fs-empty">
      <div class="fs-empty-title">${title}</div>
      <div class="fs-empty-msg">${message}</div>
    </div>`;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;

    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const child = this._child?.el;
    const maximized = this._maximized;

    return html`
      <div class="fs-root ${tedCardThemeClass(theme)}${cfg.fill ? " fill" : ""}">
        <div class="fs-normal">
          ${child && !maximized ? html`<div class="fs-child">${child}</div>` : nothing}
          ${!child ? this._renderEmpty() : nothing}
          ${child && !maximized ? this._renderToggle(false) : nothing}
        </div>
        <div
          id=${OVERLAY_ID}
          class="fs-overlay ${tedCardThemeClass(theme)}"
          popover="manual"
          style=${styleMap(this._overlayStyle())}
          @beforetoggle=${this._onOverlayToggle}
        >
          ${child && maximized ? html`<div class="fs-child">${child}</div>` : nothing}
          ${child && maximized ? this._renderToggle(true) : nothing}
        </div>
      </div>
    `;
  }

  /** Keep `_maximized` in sync if the popover closes by any other means (e.g. Esc). */
  private _onOverlayToggle = (ev: Event): void => {
    const newState = (ev as Event & { newState?: string }).newState;
    if (newState === "closed" && this._maximized) {
      this._maximized = false;
      this._persist(false);
    }
  };

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }

      .fs-root {
        height: 100%;
      }

      .fs-normal {
        position: relative;
        height: 100%;
      }

      .fs-root.fill .fs-normal {
        min-height: 100%;
      }

      .fs-child {
        height: 100%;
      }

      /* The corner toggle: a small circular, frosted button. */
      .fs-toggle {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: var(--ted-style-text, var(--primary-text-color));
        background: color-mix(in srgb, var(--ted-style-surface, var(--ha-card-background, #1c1c1c)) 72%, transparent);
        backdrop-filter: var(--ha-card-backdrop-filter, blur(6px));
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, blur(6px));
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .fs-toggle:hover {
        background: color-mix(in srgb, var(--ted-style-surface, var(--ha-card-background, #1c1c1c)) 92%, transparent);
      }
      .fs-toggle:active {
        transform: scale(0.94);
      }
      .fs-toggle ha-icon {
        --mdc-icon-size: 14px;
        width: 14px;
        height: 14px;
      }

      /* The full-screen overlay lives in the top layer (popover) so it escapes any
         transformed / clipped ancestor (grid-layout). Insets default to the content
         area (navbar reserve + safe areas); the backend path overrides via inline style. */
      .fs-overlay {
        position: fixed;
        margin: 0;
        padding: 0;
        border: none;
        overflow: hidden;
        background: var(--ted-style-surface, var(--ha-card-background, transparent));
        top: max(env(safe-area-inset-top), var(--ted-navbar-header-reserve, 0px));
        bottom: max(env(safe-area-inset-bottom), var(--ted-navbar-bottom-reserve, 0px));
        left: env(safe-area-inset-left);
        right: env(safe-area-inset-right);
        width: auto;
        height: auto;
        max-width: none;
        max-height: none;
      }
      .fs-overlay:popover-open {
        display: block;
      }
      .fs-overlay::backdrop {
        background: rgba(0, 0, 0, 0.55);
      }
      .fs-overlay .fs-child {
        width: 100%;
        height: 100%;
        overflow: auto;
      }

      .fs-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 100%;
        min-height: 120px;
        padding: 16px;
        text-align: center;
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .fs-empty-title {
        font-weight: 600;
      }
      .fs-empty-msg {
        color: var(--ted-style-muted, var(--secondary-text-color));
        font-size: 0.9em;
      }
    `,
  ];
}
