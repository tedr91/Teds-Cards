import { NAMESPACE } from "../../shared/const";
import { LABEL_BUTTON_CARD_TYPE } from "../label-button-card/const";
import type { NavButtonConfig } from "./types";

export const NAVBAR_CARD_TYPE = `${NAMESPACE}-navbar-card`;
export const NAVBAR_CARD_EDITOR_TYPE = `${NAVBAR_CARD_TYPE}-editor`;
export const NAVBAR_CARD_NAME = "Ted Navbar Card";
export const NAVBAR_CARD_DESCRIPTION =
  "A navigation bar pinned to the top or bottom of the dashboard, holding buttons in left / center / right zones.";

/** Default bar thickness (px). Buttons and status items size from this. */
export const DEFAULT_NAVBAR_SIZE = 48;

/** Default minimum bar width (px) in float mode. */
export const DEFAULT_NAVBAR_MIN_WIDTH = 16;

/** Default maximum bar width (px) in float mode. */
export const DEFAULT_NAVBAR_MAX_WIDTH = 920;

/** Maximum number of NavSections a navbar can hold. */
export const MAX_NAV_SECTIONS = 5;

/** Config for a freshly-added nav button — shared by the editor's "Add item" action
 *  and the default Navbar stub so an auto-added button is identical to a hand-added one. */
export function defaultNavButton(): NavButtonConfig {
  return {
    type: `custom:${LABEL_BUTTON_CARD_TYPE}`,
    icon: "mdi:gesture-tap-button",
    icon_scale: 150,
    icon_color: "none",
    theme: "ha",
    brushed: false,
    neumorphic: false,
    transparency: 99,
    show_name: false,
    show_state: false,
    tap_action: { action: "navigate", navigation_path: "/home" },
  };
}
