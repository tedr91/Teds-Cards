import { LovelaceCardConfig } from "custom-card-helpers";

/** Visual styling mode. `manufacturer` = Firemote-style per-device look; `ted-style` = self-contained "Ted's Home Theater" look; `ha` = follow HA theme. */
export type RemoteCardTheme = "manufacturer" | "ted-style" | "ha";

/**
 * Supported device families. Apple TV uses the built-in `apple_tv` integration;
 * Kaleidescape uses the custom `kaleidescape_strato` integration
 * (https://github.com/tedr91/HA-kaleidescape-strato), NOT the built-in one.
 */
export type DeviceFamily = "apple-tv" | "kaleidescape";

/** Logical remote buttons, mapped per-family to concrete service calls / commands. */
export type RemoteButton =
  | "power"
  | "up"
  | "down"
  | "left"
  | "right"
  | "select"
  | "back"
  | "home"
  | "menu"
  | "play_pause"
  | "rewind"
  | "fast_forward"
  | "skip_previous"
  | "skip_next"
  | "volume_up"
  | "volume_down";

export interface RemoteCardConfig extends LovelaceCardConfig {
  type: string;
  device_family: DeviceFamily;
  /** The `remote.*` entity that receives `remote.send_command` calls. */
  remote_entity: string;
  /** Optional `media_player.*` entity — drives state display and play/pause + power decisions. */
  media_player_entity?: string;  /** Kaleidescape only: which destination the Home button navigates to (a remote alias). */
  kaleidescape_home?: string;  name?: string;
  theme?: RemoteCardTheme;
  /** Optional override for the card background (hex/rgb/hsl/var or a theme color name). */
  background?: string;
  brushed?: boolean;
  show_icon?: boolean;
  icon_scale?: number;
  show_name?: boolean;
  name_scale?: number;
  scale?: number;
  // Quick-launch app buttons (Apple TV only) — each value is a media_player source name.
  app_launch_1?: string;
  app_launch_2?: string;
  app_launch_3?: string;
  app_launch_4?: string;
  app_launch_5?: string;
  app_launch_6?: string;
}
