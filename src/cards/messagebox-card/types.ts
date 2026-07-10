import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";
import type { Condition } from "../../shared/conditions";

/** Accent / tone of the message. */
export type MessageBoxSeverity = "info" | "success" | "warning" | "danger" | "tip";

/** How the message is presented. */
export type MessageBoxDisplay = "inline" | "pinned" | "modal";

/** What an action button does when tapped. */
export type MessageBoxActionKind =
  | "dismiss"
  | "dismiss-session"
  | "navigate"
  | "url"
  | "perform-action"
  | "call-service"
  | "set-setting"
  | "more-info"
  | "none";

export interface MessageBoxAction {
  label?: string;
  icon?: string;
  /** `primary` is filled with the accent; `secondary` (default) is subtle. */
  variant?: "primary" | "secondary";
  action: MessageBoxActionKind;
  // navigate
  navigation_path?: string;
  // url
  url_path?: string;
  // perform-action / call-service
  perform_action?: string;
  service?: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  // set-setting — writes a Ted's Cards setting, then navigates if navigation_path is set.
  scope?: "global" | "device";
  setting?: string;
  value?: string | number | boolean | null;
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
  pinned_side?: "top" | "center" | "bottom";

  /** Storage key used by `dismiss` (persistent) and `dismiss-session` actions.
   *  Without a key the dismiss actions only hide the card for the current view. */
  dismiss_key?: string;

  /** Standard visibility conditions (same engine as the Navbar Card): `state`,
   *  `numeric_state`, `screen` (media query), `user`, `card`, and
   *  `and`/`or`/`not`. Top-level conditions are AND-ed; omit to always show. */
  visibility?: Condition[];
  actions?: MessageBoxAction[];

  // Visual overrides
  transparency?: number;
  blur?: number;
  shadow?: boolean;
}
