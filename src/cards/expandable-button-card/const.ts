import { NAMESPACE } from "../../shared/const";
import { BUTTON_CARD_TYPE } from "../button-card/const";
import type { ButtonCardConfig } from "../button-card/types";

export const EXPANDABLE_BUTTON_CARD_TYPE = `${NAMESPACE}-expandable-button-card`;
export const EXPANDABLE_BUTTON_CARD_EDITOR_TYPE = `${EXPANDABLE_BUTTON_CARD_TYPE}-editor`;
export const EXPANDABLE_BUTTON_CARD_NAME = "Ted Expandable Button Card";
export const EXPANDABLE_BUTTON_CARD_DESCRIPTION =
  "A button that, on tap, opens a popup of child buttons (which may themselves be expandable).";

/** A freshly-added child: a plain Button Card, matching the editor's "Add button" action. */
export function defaultChildButton(): ButtonCardConfig {
  return {
    type: `custom:${BUTTON_CARD_TYPE}`,
    name: "Button",
    icon: "mdi:gesture-tap-button",
  };
}

/** A freshly-added nested Expandable Button Card child. */
export function defaultChildExpandable(): ButtonCardConfig {
  return {
    type: `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`,
    name: "Menu",
    icon: "mdi:dots-horizontal",
    items: [],
  } as ButtonCardConfig;
}
