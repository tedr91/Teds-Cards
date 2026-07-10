import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Ted Settings card. */
export interface SettingsCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Settings". */
  title?: string;
  /** Which scopes to expose. Defaults to both tabs. */
  show_global?: boolean;
  show_device?: boolean;

  /** Render only these setting groups (e.g. `["Timers"]`). Omit for all. */
  sections?: string[];
  /** Show the card header (icon + title). Defaults to true. */
  show_header?: boolean;
  /** `tabs` (default): own Global/This-device tabs. `shared`: follow the shared
   *  UI scope set by a `variant: scope-toggle` card (no internal scope tabs). */
  scope?: "tabs" | "shared";
  /** `settings` (default) renders the fields. `scope-toggle` renders only the
   *  Global / This device switch that drives every `scope: shared` card. */
  variant?: "settings" | "scope-toggle";
  /** When true, render a built-in category tab strip (one tab per settings group)
   *  plus its own Global / This device toggle — a self-contained settings UI that
   *  doesn't need an external tab card to compose the categories. */
  section_tabs?: boolean;
  /** URL query parameter that deep-links the active section tab. Defaults to `tab`. */
  url_param?: string;

  // Visual
  theme?: TedStyleTheme;
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
}
