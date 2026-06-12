import { ActionConfig, HomeAssistant, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";

/** Common shape every card in this collection extends. */
export interface BaseCardConfig extends LovelaceCardConfig {
  entity: string;
  name?: string;
  icon?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

/** A card element that accepts a `hass` property (set by HA at runtime). */
export interface HassCardElement extends LovelaceCard {
  hass?: HomeAssistant;
}

export type { HomeAssistant, LovelaceCard, LovelaceCardEditor };
