import { LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { SettingsController } from "../../shared/settings";
import { backgroundEngine } from "./background-engine";
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

  public constructor() {
    super();
    // Keep this device's effective settings live in the store (the engine reads it).
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // The shared engine owns the wallpaper; every view's card just keeps it alive
    // (ref-counted) so the background persists — and the slideshow stays on the
    // same image — as you navigate between views.
    backgroundEngine.attach(this.hass);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    backgroundEngine.detach();
  }

  protected updated(): void {
    backgroundEngine.setHass(this.hass);
  }

  public setConfig(config: BackgroundCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
  }

  public getCardSize(): number {
    return 1;
  }

  protected render(): TemplateResult | typeof nothing {
    return nothing;
  }
}
