import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import {
  type ActionConfig,
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  handleAction,
  hasConfigOrEntityChanged,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import {
  LIGHT_CARD_DESCRIPTION,
  LIGHT_CARD_EDITOR_TYPE,
  LIGHT_CARD_NAME,
  LIGHT_CARD_TYPE,
} from "./const";
import type { LightCardConfig } from "./types";

const HOLD_DURATION_MS = 500;
const TOGGLEABLE_DOMAINS = new Set(["light", "switch", "input_boolean", "fan", "media_player"]);

const DEFAULT_TAP_ACTION: ActionConfig = { action: "toggle" };
const DEFAULT_HOLD_ACTION: ActionConfig = { action: "more-info" };

registerCustomCard({
  type: LIGHT_CARD_TYPE,
  name: LIGHT_CARD_NAME,
  description: LIGHT_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#light-card",
});

@customElement(LIGHT_CARD_TYPE)
export class TedLightCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-light-card-editor");
    return document.createElement(LIGHT_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<LightCardConfig, "type"> {
    const lights = Object.keys(hass.states).filter((id) => id.startsWith("light."));
    return { entity: lights[0] ?? "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: LightCardConfig;

  private _holdTimer?: number;
  private _holdFired = false;

  public setConfig(config: LightCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!config.entity) {
      throw new Error("You must specify an entity");
    }
    const domain = config.entity.split(".")[0];
    if (!TOGGLEABLE_DOMAINS.has(domain)) {
      throw new Error(`Entity domain '${domain}' is not supported by ted-light-card`);
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 1;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config")) return true;
    return hasConfigOrEntityChanged(this, changed, false);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return html`
        <ha-card>
          <div class="not-found">
            Entity not found: <code>${this._config.entity}</code>
          </div>
        </ha-card>
      `;
    }

    const isOn = stateObj.state === "on";
    const isUnavailable = stateObj.state === "unavailable";
    const name = this._config.name || stateObj.attributes.friendly_name || this._config.entity;
    const icon = this._config.icon || stateObj.attributes.icon || "mdi:lightbulb";
    const stateLabel = this._formatState(stateObj.state);

    return html`
      <ha-card
        class=${classMap({ on: isOn, unavailable: isUnavailable })}
        tabindex="0"
        role="button"
        aria-pressed=${isOn ? "true" : "false"}
        aria-label=${name}
        @click=${this._onClick}
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
        @keydown=${this._onKeyDown}
      >
        <div class="container">
          <div class="icon-shape">
            <ha-icon .icon=${icon}></ha-icon>
          </div>
          <div class="info">
            <span class="primary">${name}</span>
            <span class="secondary">${stateLabel}</span>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _formatState(state: string): string {
    if (!state) return "";
    return state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, " ");
  }

  private _onPointerDown = (): void => {
    this._holdFired = false;
    const holdAction = this._config?.hold_action ?? DEFAULT_HOLD_ACTION;
    if (holdAction.action === "none") return;
    this._clearHoldTimer();
    this._holdTimer = window.setTimeout(() => {
      this._holdFired = true;
      this._fireAction("hold");
    }, HOLD_DURATION_MS);
  };

  private _onPointerUp = (): void => {
    this._clearHoldTimer();
  };

  private _clearHoldTimer(): void {
    if (this._holdTimer !== undefined) {
      window.clearTimeout(this._holdTimer);
      this._holdTimer = undefined;
    }
  }

  private _onClick = (ev: MouseEvent): void => {
    ev.stopPropagation();
    if (this._holdFired) {
      this._holdFired = false;
      return;
    }
    this._fireAction("tap");
  };

  private _onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._fireAction("tap");
    }
  };

  private _fireAction(action: "tap" | "hold" | "double_tap"): void {
    if (!this.hass || !this._config) return;
    const configWithDefaults = {
      ...this._config,
      tap_action: this._config.tap_action ?? DEFAULT_TAP_ACTION,
      hold_action: this._config.hold_action ?? DEFAULT_HOLD_ACTION,
      double_tap_action: this._config.double_tap_action ?? { action: "none" },
    };
    handleAction(this, this.hass, configWithDefaults, action);
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-card {
      display: flex;
      align-items: center;
      padding: 12px;
      cursor: pointer;
      transition: background-color 180ms ease, transform 120ms ease;
      outline: none;
    }
    ha-card:focus-visible {
      box-shadow: 0 0 0 2px var(--primary-color, #03a9f4);
    }
    ha-card:active {
      transform: scale(0.98);
    }
    ha-card.unavailable {
      cursor: not-allowed;
      opacity: 0.6;
    }
    .container {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .icon-shape {
      flex: 0 0 auto;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(var(--rgb-disabled, 110, 110, 110), 0.18);
      color: var(--disabled-text-color, #6e6e6e);
      transition: background-color 180ms ease, color 180ms ease;
    }
    ha-card.on .icon-shape {
      background-color: rgba(var(--rgb-state-light, 255, 193, 7), 0.22);
      color: var(--state-light-active-color, #ffc107);
    }
    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1 1 auto;
    }
    .primary {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .secondary {
      font-size: 12px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .not-found {
      padding: 12px;
      color: var(--error-color, #db4437);
      font-size: 13px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-light-card": TedLightCard;
  }
}
