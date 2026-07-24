import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/** Configuration for `ted-fullscreen-card`. */
export interface FullscreenCardConfig extends LovelaceCardConfig {
  type: string;
  /** The single card this container houses. */
  card?: LovelaceCardConfig;
  /** Surface theme for the wrapper. Default `ha`. */
  theme?: TedStyleTheme;
  /** Start maximized when there is no saved state. Default `false`. */
  start_maximized?: boolean;
  /** Fill the grid cell in the normal (non-maximized) state. Default `false`. */
  fill?: boolean;
  /** Override the "expand" corner icon (e.g. `mdi:arrow-expand-all`). */
  expand_icon?: string;
  /** Override the "minimize/restore" corner icon. */
  minimize_icon?: string;
  /**
   * Opt in to the Ted's Cards backend. When enabled the card can persist its
   * maximized state (per `state_key`) and size the overlay more intelligently
   * (navbar position / auto-hide awareness + this device's screen size).
   * Default `false` (fully self-contained).
   */
  backend_integration?: boolean;
  /**
   * Identifies this card when saving its maximized state to the backend. Required
   * for the state to persist across reloads; when unset the state stays in memory.
   */
  state_key?: string;
  /** Empty-state overrides (no `card` configured). */
  empty_title?: string;
  empty_message?: string;
}
