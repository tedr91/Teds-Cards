import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  handleAction,
  hasAction,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import {
  DEFAULT_LABEL_BUTTON_ICON,
  LABEL_BUTTON_CARD_DESCRIPTION,
  LABEL_BUTTON_CARD_EDITOR_TYPE,
  LABEL_BUTTON_CARD_NAME,
  LABEL_BUTTON_CARD_TYPE,
} from "./const";
import type { LabelButtonCardConfig } from "./types";

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;

/** Resolve a CSS color from a `ui_color` value (hex/rgb/hsl/var string or theme color name). */
function cssColor(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("var")) {
    return value;
  }
  return `var(--${value}-color, ${value})`;
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

registerCustomCard({
  type: LABEL_BUTTON_CARD_TYPE,
  name: LABEL_BUTTON_CARD_NAME,
  description: LABEL_BUTTON_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#label--button-card",
});

@customElement(LABEL_BUTTON_CARD_TYPE)
export class TedLabelButtonCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-label-button-card-editor");
    return document.createElement(LABEL_BUTTON_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<LabelButtonCardConfig, "type"> {
    return { name: "Button" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: LabelButtonCardConfig;

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;

  public setConfig(config: LabelButtonCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 2;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 3,
      rows: 2,
      min_columns: 2,
      min_rows: 1,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config") || changed.has("layout")) return true;
    if (!changed.has("hass")) return false;
    const entity = this._config.entity;
    if (!entity) return false;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    return oldHass.states[entity] !== this.hass?.states[entity];
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._clickTimer !== undefined) window.clearTimeout(this._clickTimer);
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
  }

  private _stateObj() {
    const entity = this._config?.entity;
    return entity ? this.hass?.states[entity] : undefined;
  }

  private _name(): string {
    const stateObj = this._stateObj();
    return this._config?.name ?? stateObj?.attributes?.friendly_name ?? this._config?.entity ?? "";
  }

  private _icon(): string {
    const stateObj = this._stateObj();
    return this._config?.icon ?? stateObj?.attributes?.icon ?? DEFAULT_LABEL_BUTTON_ICON;
  }

  private _stateLabel(): string {
    const stateObj = this._stateObj();
    if (!stateObj) return "";
    const unit = stateObj.attributes?.unit_of_measurement;
    const value = stateObj.state.charAt(0).toUpperCase() + stateObj.state.slice(1).replace(/_/g, " ");
    return unit ? `${stateObj.state} ${unit}` : value;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const theme = this._config.theme === "ha" ? "ha" : "ted-style";
    const brushed = this._config.brushed === true;
    const showIcon = this._config.show_icon !== false;
    const showName = this._config.show_name !== false;
    const showState = this._config.show_state !== false && !!this._stateObj();

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      clickable: hasAction(this._config.tap_action) || !!this._config.entity,
    };

    const cardStyle: Record<string, string> = {};
    const bg = cssColor(this._config.background);
    if (bg) cardStyle.background = bg;

    const iconColor = cssColor(this._config.icon_color) ?? "var(--ted-style-accent)";

    return html`
      <ha-card
        class=${classMap(cardClasses)}
        style=${styleMap(cardStyle)}
        @click=${this._onClick}
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
      >
        ${brushed ? brushedOverlay : nothing}
        <div class="lbc">
          ${showIcon
            ? html`<ha-icon class="icon" style=${styleMap({ color: iconColor })} .icon=${this._icon()}></ha-icon>`
            : nothing}
          ${showName ? html`<span class="name">${this._name()}</span>` : nothing}
          ${showState ? html`<span class="state">${this._stateLabel()}</span>` : nothing}
        </div>
      </ha-card>
    `;
  }

  private _onClick = (): void => {
    if (this._longPressFired) {
      this._longPressFired = false;
      return;
    }
    if (this._clickTimer !== undefined) {
      window.clearTimeout(this._clickTimer);
      this._clickTimer = undefined;
      this._dispatch("double_tap");
      return;
    }
    this._clickTimer = window.setTimeout(() => {
      this._clickTimer = undefined;
      this._dispatch("tap");
    }, DOUBLE_CLICK_MS);
  };

  private _onPointerDown = (): void => {
    this._longPressFired = false;
    if (!hasAction(this._config?.hold_action)) return;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._dispatch("hold");
    }, LONG_PRESS_MS);
  };

  private _onPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  /** Run a configured action. Hold/double only fire when configured; tap defaults to more-info. */
  private _dispatch(action: "tap" | "hold" | "double_tap"): void {
    if (!this.hass || !this._config) return;
    if (action === "hold" && !hasAction(this._config.hold_action)) return;
    if (action === "double_tap" && !hasAction(this._config.double_tap_action)) return;
    handleAction(this, this.hass, this._config, action);
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
      }

      ha-card {
        height: 100%;
      }

      ha-card.clickable {
        cursor: pointer;
      }

      .lbc {
        position: relative;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        height: 100%;
        min-height: 64px;
        padding: 12px;
        text-align: center;
        color: var(--ted-style-text);
      }

      .icon {
        --mdc-icon-size: 32px;
        color: var(--ted-style-accent);
      }

      .name {
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .state {
        font-size: 0.85rem;
        line-height: 1.1;
        color: var(--ted-style-muted);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-label-button-card": TedLabelButtonCard;
  }
}
