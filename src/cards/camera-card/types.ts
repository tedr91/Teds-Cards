import { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";

import type { CameraView, FitMode } from "../../shared/camera";
import type { TedStyleTheme } from "../../shared/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type CameraCardTheme = TedStyleTheme;

/**
 * How the cameras are arranged.
 * - `single`   — one feed filling the card.
 * - `dual`     — two feeds side by side.
 * - `quad`     — a 2×2 grid of feeds.
 * - `big-small` — one large feed plus a strip of smaller feeds.
 * - `auto`     — a responsive grid sized to the number of cameras (shows them all).
 */
export type CameraLayout = "single" | "dual" | "quad" | "big-small" | "auto";

/** Where the strip of small feeds sits in the `big-small` layout. */
export type BigSmallPosition = "right" | "bottom";

/** A single camera within the card. */
export interface CameraItemConfig {
  /** A `camera.*` entity. */
  entity: string;
  /** Per-camera caption override (defaults to the camera's friendly name). */
  name?: string;
  /** Periodic thumbnail (`auto`, default) vs. continuous live stream (`live`). */
  camera_view?: CameraView;
  /** When `false`, the camera is hidden from the layout. Defaults to true. */
  enabled?: boolean;
}

export interface CameraCardConfig extends LovelaceCardConfig {
  type: string;
  /** The cameras shown in the card. Omit when `cameras_source: settings`. */
  cameras?: CameraItemConfig[];
  /** Where the camera list comes from. `config` (default) uses `cameras`; `settings`
   *  uses this device's per-device Cameras list from the Ted's Cards settings. */
  cameras_source?: "config" | "settings";
  /** Arrangement of the feeds. Defaults to `single`. */
  layout?: CameraLayout;
  /** Placement of the small-feed strip in the `big-small` layout. Defaults to `right`. */
  big_small_position?: BigSmallPosition;
  /** Percentage of the card taken by the small-feed strip in the `big-small` layout. Defaults to 25. */
  big_small_width?: number;
  /** Show the caption overlay at the bottom of each feed. Defaults to false. */
  show_name?: boolean;
  /** Font size (px) of the camera-name overlay. Defaults to 14. */
  name_size?: number;
  /** How the feed fills its box. Defaults to `cover`. */
  fit_mode?: FitMode;
  /** Optional fixed aspect ratio (e.g. `16:9`). Ignored when in a grid with set rows. */
  aspect_ratio?: string;
  theme?: CameraCardTheme;
  /** Brushed-metal sheen overlay. Defaults to false. */
  brushed?: boolean;
  /** Card background color override (theme color name or hex/rgb/hsl/var). */
  background?: string;
  transparency?: number;
  blur?: number;
  /** Manual width in px (used outside the Sections grid). */
  width?: number;
  /** Manual height in px (used outside the Sections grid). */
  height?: number;
  /** Fill the parent instead of a fixed size (like a grid cell). Ignores width/height. */
  fill?: boolean;
  /** Empty-state (only in `settings` mode when no cameras are available). */
  empty_title?: string;
  empty_message?: string;
  /** Where the empty-state "Settings" button navigates. `[root]` is substituted with
   *  the dashboard root. Defaults to `[root]/settings?tab=cameras`. */
  settings_path?: string;
  /** Defaults to opening the more-info dialog. */
  tap_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
