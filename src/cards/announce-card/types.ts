import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Announce card. Appearance mirrors the other Ted's Cards. */
export interface AnnounceCardConfig extends LovelaceCardConfig {
  type: string;
  /** Header text. Defaults to "Announce". */
  title?: string;

  // Visual
  theme?: TedStyleTheme;
  /** Optional override for the card background (hex/rgb/hsl/var or a theme color name). */
  background?: string;
  transparency?: number;
  blur?: number;
  brushed?: boolean;
  shadow?: boolean;
  /** Overall card scale, as a percentage (50–200). Defaults to 100. */
  scale?: number;

  // Header
  /** Show the header icon. Defaults to true. */
  show_header_icon?: boolean;
  /** Header icon size override, as a percentage (10–400). Blank = 100. */
  header_icon_size?: number;
  /** Show the header title. Defaults to true. */
  show_header_name?: boolean;
  /** Header title size override, as a percentage (10–400). Blank = 100. */
  header_name_size?: number;
  /** Show a divider line under the header. Defaults to false. */
  header_divider?: boolean;

  /** Deep link to the Settings tab that edits the predefined message list.
   *  Defaults to "[root]/settings?tab=announce". */
  settings_path?: string;
}

/** An entry in the backend `sensor.teds_announcements` recent list. */
export interface RecentAnnouncement {
  id: string;
  message: string;
  title?: string;
  icon?: string;
  areas?: string[];
  devices?: string[];
  persistent?: boolean;
  timeout?: number | null;
  last_sent?: string;
  /** The device that sent it (id + resolved name), for the "from X" line. */
  source_device?: string;
  source_device_name?: string;
}
