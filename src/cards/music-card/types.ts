import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * Where the player entity comes from.
 * - `settings` (default) — this device's `music_player` setting (Settings → Sounds).
 * - `config`             — the card's own `entity`.
 */
export type MusicPlayerSource = "settings" | "config";

export interface MusicCardConfig extends LovelaceCardConfig {
  type: string;
  /** Explicit media_player entity. Wins over the Settings value; required for `player_source: config`. */
  entity?: string;
  /** Where the player entity comes from. Defaults to `settings`. */
  player_source?: MusicPlayerSource;
  /** When the resolved entity is not a Music Assistant player, try to find its
   *  Music Assistant counterpart at runtime (by device, then by name). Default true. */
  auto_resolve_mass_player?: boolean;
  /** Which player card renders the resolved Music Assistant entity:
   *  `yamp` (default) = jianyu-li/yet-another-media-player, `mass` = droans/mass-player-card. */
  engine?: "mass" | "yamp";
  /** Extra options merged into the embedded `mass-player-card` config
   *  (everything except `type`/`entities`). Used when `engine` is `mass`. */
  mass_config?: Record<string, unknown>;
  /** Extra options merged into the embedded `yet-another-media-player` config
   *  (everything except `type`/`entities`). Used when `engine` is `yamp`. */
  yamp_config?: Record<string, unknown>;
  /** Side-by-side split: LEFT width percent. One of 100 | 70 | 60 | 50 | 40 | 30.
   *  100 (default) = single pane. When < 100, renders the player on the LEFT and a
   *  library/search/queue pane on the RIGHT (both driving the same resolved player). */
  split?: number;
  /** Extra options merged into the LEFT (player) pane when `split` < 100 (engine-specific keys). */
  left_config?: Record<string, unknown>;
  /** Extra options merged into the RIGHT (library/search/queue) pane when `split` < 100. */
  right_config?: Record<string, unknown>;
  /** Show the vertical layout-switcher pill (between the panes) that opens a flyout of
   *  split choices. Default true when the card fills its area. */
  layout_switcher?: boolean;
  /** Stretch the player to fill the dashboard content area (sizes the embedded
   *  mass-player-card to the content area's height, minus its own tab bar).
   *  Off (default) sizes the player to its content, centered in the view. */
  fill?: boolean;
  /** Set the player to this device's "Music volume" setting when playback first
   *  starts (the leading edge of playing). Default true. */
  apply_music_volume?: boolean;
  theme?: TedStyleTheme;
  /** Empty-state overrides (no player configured for this device). */
  empty_title?: string;
  empty_message?: string;
  /** "Needs mapping" state overrides (a speaker with no Music Assistant match). */
  unmatched_title?: string;
  unmatched_message?: string;
  /** Where the empty-state "Settings" button navigates. Supports `[root]`. */
  settings_path?: string;
  /** Where the unmatched-state "Music Assistant" button navigates (the MA panel).
   *  Defaults to `/music-assistant`. */
  mass_setup_path?: string;
}
