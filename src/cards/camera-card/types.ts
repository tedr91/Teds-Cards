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
 */
export type CameraLayout = "single" | "dual" | "quad" | "big-small";

/** Where the strip of small feeds sits in the `big-small` layout. */
export type BigSmallPosition = "right" | "bottom";

/** A single camera within the card. */
export interface CameraItemConfig {
  /** A `camera.*` entity. */
  entity: string;
  /** Per-camera caption override (defaults to the camera's friendly name). */
  name?: string;
  /** When `false`, the camera is hidden from the layout. Defaults to true. */
  enabled?: boolean;
}

export interface CameraCardConfig extends LovelaceCardConfig {
  type: string;
  /** The cameras shown in the card. */
  cameras: CameraItemConfig[];
  /** Arrangement of the feeds. Defaults to `single`. */
  layout?: CameraLayout;
  /** Placement of the small-feed strip in the `big-small` layout. Defaults to `right`. */
  big_small_position?: BigSmallPosition;
  /** Show the caption overlay at the bottom of each feed. Defaults to false. */
  show_name?: boolean;
  /** Periodic thumbnail (`auto`, default) vs. continuous live stream (`live`). */
  camera_view?: CameraView;
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
  /** Defaults to opening the more-info dialog. */
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}
