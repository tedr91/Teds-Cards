import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";

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
  /** Conditions that gate the item's visibility. */
  visibility?: Condition[];
};

/** A custom action row in the navbar's long-press menu (e.g. a Refresh or Git Pull
 *  utility). Runs a standard Home Assistant action via `tap_action`. */
export interface NavMenuItem {
  /** Row label. */
  name: string;
  /** Optional leading icon (mdi:* recommended so it renders without the icon pack). */
  icon?: string;
  /** Entity for actions that need one (e.g. `more-info`, `toggle`). */
  entity?: string;
  /** The action to run when the row is tapped (call-service, navigate, url, …). */
  tap_action?: ActionConfig;
}

/** An item in a navbar section: a button or a status item. (A "popup menu" is just a
 *  nav button whose type is `custom:ted-expandable-button-card`.) */
export type NavItem = NavButtonConfig | StatusItem;

/** A section of the navbar. Its position is FIXED by index (0=start, 2=center, 4=end;
 *  1 and 3 fill the gaps) — there is no `placement`. */
export interface NavSection {
  /** How the section's content is aligned (only adjustable for the mid sections 1 & 3).
   *  On a vertical bar, left/right read as up/down. Defaults per fixed section. */
  align?: NavAlign;
  /** Whether the section is shown. Defaults to true. */
  visible?: boolean;
  /** Collapse items that don't fit into a chevron overflow popup. Defaults to true. */
  overflow?: boolean;
  /** Auto-collapse priority 1-5; higher collapses first when the bar runs out of room. */
  priority?: number;
  /** Ordered mix of nav buttons and status items. */
  items?: NavItem[];
  /** Legacy buttons-only list; read as items when `items` is unset. */
  buttons?: NavButtonConfig[];
}

export interface NavbarCardConfig extends LovelaceCardConfig {
  type: string;
  /** Opt into Ted's Cards Backend integration (YAML-only; default false). When true,
   *  this navbar gains backend-driven behaviours: auto-return-home on idle, redirecting
   *  the welcome view to the device's configured home on load, and the `navigate-dashboard`
   *  action on status items. Left false so the card is safe to drop into any dashboard
   *  without odd cross-navigation. Set true on the navbar in Ted's Dashboard. */
  backend_integration?: boolean;
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
  /** Auto-hide: collapse the bar into its edge (a small pill remains) until revealed. */
  auto_hide?: boolean;
  /** Seconds before an auto-hide bar re-collapses after being revealed. Default 5. */
  auto_hide_delay?: number;
  /** Long-press the bar to open a settings menu (auto-hide / float / position toggles,
   *  plus Exit + Dashboard Settings links). Default true. */
  hold_menu?: boolean;
  /** Extra custom action rows shown in the long-press menu, in their own section just
   *  above Dashboard Settings (e.g. dashboard utilities like Refresh or Git Pull). */
  menu_items?: NavMenuItem[];
  /** Where the hold-menu "Exit" item navigates. Default "/lovelace". */
  exit_path?: string;
  /** Up to MAX_NAV_SECTIONS sections. */
  sections?: NavSection[];
}
