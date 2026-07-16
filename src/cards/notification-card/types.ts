import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Notification Center card. */
export interface NotificationCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Notifications". */
  title?: string;
  /** Optional area to scope the card to; only that area's notifications are shown. */
  area?: string;

  // Visual
  theme?: TedStyleTheme;
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  scale?: number;

  // Header
  show_header_icon?: boolean;
  header_icon_size?: number;
  show_header_name?: boolean;
  header_name_size?: number;
  header_divider?: boolean;

  // Behavior
  /** Pop toasts for new notifications from this card. Defaults to true. */
  show_toasts?: boolean;
  /** Mark everything read when the panel is opened. Defaults to false (per-item). */
  mark_read_on_open?: boolean;
  /** Maximum notifications to list. Defaults to 50. */
  max_items?: number;
}
