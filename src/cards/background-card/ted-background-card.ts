import { LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { SettingsController } from "../../shared/settings";
import { BACKGROUND_KEYS } from "../../shared/background";
import type { SettingsMap, SettingsValue } from "../../shared/settings-schema";
import { backgroundEngine } from "./background-engine";
import { nightModeEngine } from "./night-mode-engine";
import {
  BACKGROUND_CARD_DESCRIPTION,
  BACKGROUND_CARD_EDITOR_TYPE,
  BACKGROUND_CARD_NAME,
  BACKGROUND_CARD_TYPE,
} from "./const";
import type { BackgroundCardConfig } from "./types";

registerCustomCard({
  type: BACKGROUND_CARD_TYPE,
  name: BACKGROUND_CARD_NAME,
  description: BACKGROUND_CARD_DESCRIPTION,
  preview: false,
  documentationURL: "https://github.com/tedr91/Teds-Cards#background-card",
});

@customElement(BACKGROUND_CARD_TYPE)
export class TedBackgroundCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-background-card-editor");
    return document.createElement(BACKGROUND_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<BackgroundCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  private _config?: BackgroundCardConfig;

  public constructor() {
    super();
    // Only feed/subscribe the backend settings store when the card opts in;
    // card-only use stays fully self-contained (getHass returns undefined).
    new SettingsController(this, () => (this._config?.backend_integration ? this.hass : undefined));
  }

  /** The card's per-card background_* overrides as a settings map. */
  private _overrides(): SettingsMap {
    const cfg = this._config as Record<string, unknown> | undefined;
    if (!cfg) return {};
    const ov: SettingsMap = {};
    for (const k of BACKGROUND_KEYS) {
      if (cfg[k] !== undefined) ov[k] = cfg[k] as SettingsValue;
    }
    return ov;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // The shared engine owns the wallpaper; every view's card just keeps it alive
    // (ref-counted) so the background persists — and the slideshow stays on the
    // same image — as you navigate between views.
    backgroundEngine.attach(this.hass, this._overrides(), !!this._config?.backend_integration);
    // The night-mode engine runs on the same always-present card; it only acts when the
    // card opts into the backend settings store (backend_integration).
    nightModeEngine.attach(this.hass, !!this._config?.backend_integration);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    backgroundEngine.detach();
    nightModeEngine.detach();
  }

  protected updated(): void {
    backgroundEngine.setHass(this.hass);
    nightModeEngine.setHass(this.hass);
  }

  public setConfig(config: BackgroundCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (this.isConnected) {
      backgroundEngine.setConfig(this._overrides(), !!config.backend_integration);
    }
  }

  public getCardSize(): number {
    return 1;
  }

  protected render(): TemplateResult | typeof nothing {
    return nothing;
  }
}
