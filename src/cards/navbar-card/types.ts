import type { LovelaceCardConfig } from "custom-card-helpers";

import type { StatusItem } from "../../shared/status-items/types";
import type { TedStyleTheme } from "../../shared/types";
import type { LabelButtonCardConfig } from "../label-button-card/types";

/** Which screen edge the navbar is pinned to. */
export type NavbarAlignment = "bottom" | "top";

/** Snap = edge-to-edge full width; float = centered with margins and rounded corners. */
export type NavbarType = "snap" | "float";

/** Horizontal zone a section is placed in. */
export type NavZone = "left" | "center" | "right";

/** Content alignment of items within a section. */
export type NavAlign = "left" | "center" | "right";

/** Relative width of a nav button. */
export type NavButtonSize = "normal" | "wide";

/** A navbar button: a label-button card plus nav-only sizing. */
export type NavButtonConfig = LabelButtonCardConfig & {
  nav_button_size?: NavButtonSize;
};

/** A popup: a tappable icon that opens a popover holding more nav items. */
export interface NavPopupConfig {
  type: "popup";
  /** Trigger icon (mdi:…). Defaults to a “⋯” glyph. */
  icon?: string;
  /** Accessible label / tooltip for the trigger. */
  name?: string;
  /** Trigger size, like a button. */
  nav_button_size?: NavButtonSize;
  /** Items shown inside the popover (buttons + status items). */
  items?: NavItem[];
}

/** An item in a navbar section: a button, a status item, or a popup. */
export type NavItem = NavButtonConfig | StatusItem | NavPopupConfig;

/** A section of the navbar, placed in a zone and holding an ordered list of items. */
export interface NavSection {
  /** Which zone the section sits in. Defaults to "left". */
  placement?: NavZone;
  /** How the section's content is aligned. Defaults to "center". */
  align?: NavAlign;
  /** Whether the section is shown. Defaults to true. */
  visible?: boolean;
  /** Collapse items that don't fit into a “…” overflow popup. Defaults to true. */
  overflow?: boolean;
  /** Ordered mix of nav buttons and status items. */
  items?: NavItem[];
  /** Legacy buttons-only list; read as items when `items` is unset. */
  buttons?: NavButtonConfig[];
}

export interface NavbarCardConfig extends LovelaceCardConfig {
  type: string;
  /** Visual styling: ted-style (default) or follow the HA theme. */
  theme?: TedStyleTheme;
  /** Screen edge: bottom (default) or top. */
  alignment?: NavbarAlignment;
  /** snap (default, edge-to-edge) or float (centered with margins). */
  bar_type?: NavbarType;
  /** Bar thickness in px; buttons/status items size from this. */
  size?: number;
  /** Float mode: minimum bar width in px. */
  min_width?: number;
  /** Float mode: maximum bar width in px. */
  max_width?: number;
  /** Card background color override (theme color name or hex/rgb/hsl/var). */
  background?: string;
  /** Background transparency override, 0–100% (unset = no override). */
  transparency?: number;
  /** Background blur override, 0–100% (unset = no override). */
  blur?: number;
  /** Up to MAX_NAV_SECTIONS sections. */
  sections?: NavSection[];
}
