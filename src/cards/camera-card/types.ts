import { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";

import type { CameraView, FitMode } from "../../shared/camera";
import type { TedStyleTheme } from "../../shared/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type CameraCardTheme = TedStyleTheme;

export interface CameraCardConfig extends LovelaceCardConfig {
  type: string;
  /** A `camera.*` entity. */
  entity: string;
  /** Overlay caption (defaults to the camera's friendly name when shown). */
  name?: string;
  /** Show the caption overlay at the bottom of the feed. Defaults to false. */
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
