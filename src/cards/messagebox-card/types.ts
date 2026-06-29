import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Accent / tone of the message. */
export type MessageBoxSeverity = "info" | "success" | "warning" | "danger" | "tip";

/** How the message is presented. */
export type MessageBoxDisplay = "inline" | "pinned" | "modal";

/** Device form factors usable in `show_if.form_factor`. `amazon` matches Amazon
 *  Silk devices (Echo Show / Fire) via user agent. */
export type FormFactor =
  | "portrait-small"
  | "portrait-large"
  | "landscape-small"
  | "landscape-large"
  | "amazon";

/** Built-in visibility conditions. When more than one key is set the card is
 *  shown if ANY of them is satisfied (logical OR). Omit `show_if` to always show. */
export interface MessageBoxShowIf {
  /** Show when the current device matches one of these form factors. */
  form_factor?: FormFactor | FormFactor[];
  /** Show when NOT on a View Assist device (no `view_assist_sensor`). */
  not_view_assist?: boolean;
  /** Show when any of these custom card types is not registered. */
  missing_cards?: string[];
  /** Show based on an entity's state. */
  entity?: string;
  state?: string | string[];
  state_not?: string | string[];
}

/** What an action button does when tapped. */
export type MessageBoxActionKind =
  | "view-assist-navigate"
  | "dismiss"
  | "dismiss-session"
  | "navigate"
  | "url"
  | "perform-action"
  | "call-service"
  | "more-info"
  | "none";

export interface MessageBoxAction {
  label?: string;
  icon?: string;
  /** `primary` is filled with the accent; `secondary` (default) is subtle. */
  variant?: "primary" | "secondary";
  action: MessageBoxActionKind;
  // view-assist-navigate
  view?: string;
  // navigate
  navigation_path?: string;
  // url
  url_path?: string;
  // perform-action / call-service
  perform_action?: string;
  service?: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  // more-info
  entity?: string;
}

export interface MessageBoxCardConfig extends LovelaceCardConfig {
  type: string;
  theme?: TedStyleTheme;
  severity?: MessageBoxSeverity;
  icon?: string;
  title?: string;
  message?: string;
  /** Optional "learn more" link rendered under the message. */
  docs_url?: string;
  docs_label?: string;

  display?: MessageBoxDisplay;
  /** Edge to pin to when `display: pinned`. Defaults to top. */
  pinned_side?: "top" | "bottom";

  /** Storage key used by `dismiss` (persistent) and `dismiss-session` actions.
   *  Without a key the dismiss actions only hide the card for the current view. */
  dismiss_key?: string;

  show_if?: MessageBoxShowIf;
  actions?: MessageBoxAction[];

  // Visual overrides
  transparency?: number;
  blur?: number;
  shadow?: boolean;
}
