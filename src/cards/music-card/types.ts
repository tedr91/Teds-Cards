import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/**
 * Background treatment for the player surface.
 * - `blur` (default) — heavily blurred album art, frosted with the album's average color.
 * - `none`           — the active theme surface (Ted's style or Home Assistant), no overlay.
 */
export type MusicBackgroundMode = "blur" | "none";

/** The tabs shown on the right side of the full player. */
export type MusicTab = "media" | "queue" | "lyrics";

/** Player layout. `full` = the two-pane player + tabs; `mini` = a compact bar that
 *  adapts to the card size — controls collapse into the “…” menu as it narrows, and
 *  drop to a row below the title/artist when the card is tall enough. */
export type MusicMode = "full" | "mini";

/** How the Media tab presents library items. `tiles` = artwork grid; `list` = rows. */
export type MusicMediaLayout = "tiles" | "list";

export interface MusicCardConfig extends LovelaceCardConfig {
  type: string;
  /** Explicit media_player entity. Used when `dashboard_integration` is off;
   *  overrides the Settings value when set. */
  entity?: string;
  /** When true (YAML-only), the player comes from this device's Ted's Cards
   *  Settings (Music player → System sounds player → the device's own player)
   *  instead of `entity`. Default false. */
  dashboard_integration?: boolean;
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
  /** How the Media tab presents library items. Default `tiles`. */
  media_layout?: MusicMediaLayout;
  theme?: TedStyleTheme;
  /** Empty-state overrides (no player configured for this device). */
  empty_title?: string;
  empty_message?: string;
  /** "Needs mapping" state overrides (a speaker with no Music Assistant match). */
  unmatched_title?: string;
  unmatched_message?: string;
  /** Where the empty-state "Settings" button navigates. Supports `[root]`. */
  settings_path?: string;
  /** Base URL of the Music Assistant server for the "Party Mode!" mini-menu action
   *  (its `#/party` dashboard). Defaults to `http://<hostname>:8095` (MA's default
   *  port for a local install). */
  party_url?: string;
  /** Dashboard view path the party page opens in (the Ted Web View page).
   *  Default `webview`. */
  party_view_path?: string;
  /** Where the unmatched-state "Music Assistant" button navigates (the MA panel).
   *  Defaults to `/music-assistant`. */
  mass_setup_path?: string;
}
