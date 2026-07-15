import type { ButtonCardConfig } from "../button-card/types";

/** How the child buttons are arranged inside the popup. */
export type PopupLayout = "grid" | "list";

/** A child inside the popup: a plain Button Card, or a nested Expandable Button Card. */
export type ExpandableChildConfig = ButtonCardConfig | ExpandableButtonCardConfig;

/**
 * An Expandable Button Card: a Button Card (the trigger) plus a popup of child buttons.
 * Tapping the trigger opens a native popover holding the `items`. Children may themselves
 * be Expandable Button Cards, opening nested popups without closing their parent.
 */
export interface ExpandableButtonCardConfig extends ButtonCardConfig {
  /** Child buttons shown in the popup. */
  items?: ExpandableChildConfig[];
  /** Popup arrangement: a grid of square tiles (default) or a single vertical list. */
  popup_layout?: PopupLayout;
  /** Maximum columns in the grid layout. Unset = no limit (the grid sizes to the number
   *  of buttons, in a single row). Ignored for the list layout. */
  popup_max_columns?: number;
  /** Optional heading shown at the top of the popup. */
  popup_title?: string;
  /** Inline style overrides for the popup surface (e.g. to mirror a navbar's background /
   *  blur so a launcher group's popup matches the bar). */
  popup_style?: Record<string, string>;
  /** Size (px) of each grid popup button, e.g. to match a navbar's button size. */
  popup_item_size?: number;
  /** Show a small "group" glyph in the trigger's corner (e.g. for combined launcher groups). */
  group_indicator?: boolean;
  /** Quick-launch: single tap on the trigger runs its `tap_action` (navigate) and a hold
   *  opens the popout — instead of a tap opening the popout. */
  quick_launch?: boolean;
  /** Flip the trigger icon (e.g. a chevron) 180° while the popup is open. Defaults to true. */
  flip_icon?: boolean;
}
