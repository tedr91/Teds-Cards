import { NAMESPACE } from "../../shared/const";
import { BUTTON_CARD_TYPE } from "../button-card/const";
import type { NavAlign, NavButtonConfig, NavSection } from "./types";

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

/** Default seconds before an auto-hide bar re-collapses after being revealed. */
export const DEFAULT_NAVBAR_AUTOHIDE_DELAY = 5;

/** Space (px) reserved at the edge for the collapsed auto-hide reveal pill, so content
 *  stops just short of it. Sized to clear the visible pill (which sits at bottom:10 +
 *  height:20 = ~30px). Published as `--ted-navbar-bottom-reserve` for self-sizing views. */
export const NAVBAR_PILL_RESERVE = 20;

/** Maximum number of NavSections a navbar can hold. */
export const MAX_NAV_SECTIONS = 5;

/** The five fixed navbar sections, in bar order. Sections are positional (no `placement`):
 *  index 0 = far start, 2 = center, 4 = far end; 1 and 3 fill the gaps. */
export const NAV_SECTION_NAMES = [
  "Left Section",
  "Mid-Left Section",
  "Center Section",
  "Mid-Right Section",
  "Right Section",
] as const;

/** Per-section default content alignment: "left"/"center"/"right" (up/down on a vertical bar). */
export const NAV_SECTION_DEFAULT_ALIGN: NavAlign[] = ["left", "left", "center", "right", "right"];

/** Sections whose alignment is fixed (0/2/4) vs. user-adjustable (1/3). */
export const NAV_SECTION_ALIGN_LOCKED = [true, false, true, false, true];

/** Default auto-collapse priority per section (1-5). Higher collapses first. */
export const NAV_SECTION_DEFAULT_PRIORITY = [1, 5, 3, 5, 1];

/** The five fixed sections with default alignment + priority and empty item lists. */
export function defaultNavSections(): NavSection[] {
  return NAV_SECTION_DEFAULT_ALIGN.map((align, i) => ({
    align,
    priority: NAV_SECTION_DEFAULT_PRIORITY[i],
    items: [],
  }));
}

/** Config for a freshly-added nav button — shared by the editor's "Add item" action
 *  and the default Navbar stub so an auto-added button is identical to a hand-added one. */
export function defaultNavButton(): NavButtonConfig {
  return {
    type: `custom:${BUTTON_CARD_TYPE}`,
    icon: "mdi:gesture-tap-button",
    icon_scale: 140,
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
