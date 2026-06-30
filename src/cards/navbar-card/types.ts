import type { LovelaceCardConfig } from "custom-card-helpers";

import type { Condition } from "../../shared/conditions";
import type { StatusItem } from "../../shared/status-items/types";
import type { TedStyleTheme } from "../../shared/types";
import type { ButtonCardConfig } from "../button-card/types";

/** Which screen edge the navbar is pinned to. */
export type NavbarAlignment = "bottom" | "top" | "left" | "right";

/** Snap = edge-to-edge full width; float = centered with margins and rounded corners. */
export type NavbarType = "snap" | "float";

/** Horizontal zone a section is placed in. */
export type NavZone = "left" | "center" | "right";

/** Content alignment of items within a section. */
export type NavAlign = "left" | "center" | "right";

/** Relative width of a nav button. */
export type NavButtonSize = "normal" | "wide";

/** A navbar button: a button card plus nav-only sizing and visibility. */
export type NavButtonConfig = ButtonCardConfig & {
  nav_button_size?: NavButtonSize;
  /** Hide the item outright (default true = shown). */
  visible?: boolean;
  /** Conditions (HA-style + `view-assist`) that gate the item's visibility. */
  visibility?: Condition[];
};

/** An item in a navbar section: a button or a status item. (A "popup menu" is just a
 *  nav button whose type is `custom:ted-expandable-button-card`.) */
export type NavItem = NavButtonConfig | StatusItem;

/** Binds to an entity attribute: a section's `items_source` (a list of View Assist
 *  status-icon / menu strings) or the card's `size_source` (a View Assist size value). */
export interface EntityAttrSource {
  /** Entity whose attribute is read (e.g. a View Assist `sensor.<name>`). Omit when
   *  `va_device` is set. */
  entity?: string;
  /** Resolve the entity from the current device's View Assist sensor (the
   *  `view_assist_sensor` localStorage key) instead of a static `entity`, so one shared
   *  dashboard reads each device's own values. Falls back to `entity` when not on a VA device. */
  va_device?: boolean;
  /** Attribute holding the value (e.g. `status_icons`, `menu_items`, `status_icons_size`). */
  attribute: string;
}

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
  /** Append buttons parsed from a list of View Assist status-icon / menu strings read
   *  off an entity attribute. Sourced buttons follow the section's own items and are
   *  de-duped against them (so e.g. a curated Home button isn't doubled). */
  items_source?: EntityAttrSource;
}

export interface NavbarCardConfig extends LovelaceCardConfig {
  type: string;
  /** Visual styling: ted-style (default) or follow the HA theme. */
  theme?: TedStyleTheme;
  /** Screen edge: bottom (default), top, left, or right. Left/right are vertical bars. */
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
  /** Drive the bar thickness from an entity attribute holding a View Assist size
   *  ("6vw"/"7vw"/"8vw" → 35/42/50 px). Overrides `size` when it resolves; View Assist's
   *  own vw rendering is intentionally not used. */
  size_source?: EntityAttrSource;
  /** Up to MAX_NAV_SECTIONS sections. */
  sections?: NavSection[];
}
