import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/** Configuration for `ted-fullscreen-card`. */
export interface FullscreenCardConfig extends LovelaceCardConfig {
  type: string;
  /** The single card this container houses. */
  card?: LovelaceCardConfig;
  /** Surface theme for the wrapper. Default `ha`. */
  theme?: TedStyleTheme;
  /** Show the corner expand/collapse button. Default `true`. */
  show_toggle?: boolean;
  /** Start maximized when there is no saved state. Default `false`. */
  start_maximized?: boolean;
  /** Fill the grid cell in the normal (non-maximized) state. Default `false`. */
  fill?: boolean;
  /** Override the "expand" corner icon (e.g. `mdi:arrow-expand-all`). */
  expand_icon?: string;
  /** Override the "minimize/restore" corner icon. */
  minimize_icon?: string;

  // Appearance (shared with the other Ted's cards). When any of background /
  // transparency / blur / brushed is set, the card paints its own frosted surface
  // behind the housed card (otherwise it stays a transparent passthrough).
  /** Surface background color (ui_color: hex, rgb, or a theme color name). */
  background?: string;
  /** Surface transparency 0–100 (%). Empty = no override. */
  transparency?: number;
  /** Surface backdrop blur 0–100 (%). Empty = no override. */
  blur?: number;
  /** Brushed-metal overlay on the surface. Default `false`. */
  brushed?: boolean;
  /** Subtle drop shadow on the surface. Default `true` (only visible with a surface). */
  shadow?: boolean;
  /** Zoom the card content (percent). Default `100`. */
  scale?: number;
  /**
   * Opt in to the Ted's Cards backend. When enabled the card can persist its
   * maximized state (per `state_key`) and size the overlay more intelligently
   * (navbar position / auto-hide awareness + this device's screen size).
   * Default `false` (fully self-contained). YAML-only (not in the visual editor).
   */
  backend_integration?: boolean;
  /**
   * Identifies this card when saving its maximized state to the backend. Required
   * for the state to persist across reloads; when unset the state stays in memory.
   * YAML-only (not in the visual editor).
   */
  state_key?: string;
  /** Empty-state overrides (no `card` configured). */
  empty_title?: string;
  empty_message?: string;
}
