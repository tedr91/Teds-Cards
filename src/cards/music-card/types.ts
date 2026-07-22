import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * Where the player entity comes from.
 * - `settings` (default) — this device's `music_player` setting (Settings → Sounds).
 * - `config`             — the card's own `entity`.
 */
export type MusicPlayerSource = "settings" | "config";

/**
 * Background treatment for the player surface.
 * - `avg_gradient` (default) — vertical gradient derived from the album art's average colour.
 * - `blur`                   — heavily blurred, scaled album art.
 * - `ted`                    — Ted's brushed dark surface.
 * - `ha`                     — the active Home Assistant theme surface.
 */
export type MusicBackgroundMode = "avg_gradient" | "blur" | "ted" | "ha";

/** The tabs shown on the right side of the full player. */
export type MusicTab = "media" | "queue" | "recent" | "lyrics";

/** Player layout. `full` = the two-pane player + tabs; `mini` = a compact one-row bar. */
export type MusicMode = "full" | "mini";

export interface MusicCardConfig extends LovelaceCardConfig {
  type: string;
  /** Explicit media_player entity. Wins over the Settings value; required for `player_source: config`. */
  entity?: string;
  /** Where the player entity comes from. Defaults to `settings`. */
  player_source?: MusicPlayerSource;
  /** Player layout. Default `full`. */
  mode?: MusicMode;
  /** When the resolved entity is not a Music Assistant player, try to find its
   *  Music Assistant counterpart at runtime (by device, then by name). Default true. */
  auto_resolve_mass_player?: boolean;
  /** Background treatment for the player surface. Default `blur`. */
  background_mode?: MusicBackgroundMode;
  /** Lock the media player target device: when true, the "cast to" chip is a static
   *  label (no device-switching flyout). Default false. */
  lock_target_device?: boolean;
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
