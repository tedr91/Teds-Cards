import { NAMESPACE } from "../../shared/const";

export const LABEL_BUTTON_CARD_TYPE = `${NAMESPACE}-label-button-card`;
export const LABEL_BUTTON_CARD_EDITOR_TYPE = `${LABEL_BUTTON_CARD_TYPE}-editor`;
export const LABEL_BUTTON_CARD_NAME = "Ted Label / Button Card";
export const LABEL_BUTTON_CARD_DESCRIPTION =
  "A label or button with an optional entity, icon and tap/hold actions.";

export const DEFAULT_LABEL_BUTTON_ICON = "mdi:gesture-tap-button";

/** Domains whose default button (tap) action is "toggle" — mirrors Home Assistant's
 *  getEntityDefaultButtonAction. Everything else defaults to "more-info". */
export const TOGGLE_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "input_boolean",
  "automation",
  "script",
  "group",
  "cover",
  "lock",
  "climate",
  "media_player",
  "humidifier",
  "valve",
  "siren",
  "remote",
  "vacuum",
]);

/** Home Assistant's default button action for an entity: "toggle" for toggleable
 *  domains, "more-info" for anything else, and "none" when no entity is set. */
export function entityDefaultButtonAction(entityId?: string): "toggle" | "more-info" | "none" {
  if (!entityId) return "none";
  return TOGGLE_DOMAINS.has(entityId.split(".")[0]) ? "toggle" : "more-info";
}
