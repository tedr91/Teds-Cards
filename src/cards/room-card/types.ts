import { LovelaceCardConfig } from "custom-card-helpers";

import type { CameraView, FitMode } from "../../shared/camera";
import type { TedStyleTheme } from "../../shared/types";
import type { CameraCardConfig } from "../camera-card/types";
import type { CoverCardConfig } from "../cover-card/types";
import type { LightCardConfig } from "../light-card/types";
import type { ButtonCardConfig } from "../button-card/types";
import type { SpacerCardConfig } from "../spacer-card/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type RoomCardTheme = TedStyleTheme;

/**
 * Status-strip items. The Room Card uses a subset of the shared status-item set
 * (it omits the Navbar-only time/date/weather kinds). The underlying types live
 * in the shared `status-items` module so both cards render identically.
 */
import type {
  BrightnessStatusItem,
  LedStatusItem,
  SensorStatusItem,
  SpacerStatusItem,
  StatusDisplay,
  VolumeStatusItem,
} from "../../shared/status-items/types";

export type RoomStatusDisplay = StatusDisplay;
export type RoomSensorStatusItem = SensorStatusItem;
export type RoomBrightnessStatusItem = BrightnessStatusItem;
export type RoomVolumeStatusItem = VolumeStatusItem;
export type RoomLedStatusItem = LedStatusItem;
export type RoomSpacerStatusItem = SpacerStatusItem;

export type RoomStatusItemType =
  | "temperature"
  | "occupancy"
  | "brightness"
  | "volume"
  | "led"
  | "spacer";

export type RoomStatusItem =
  | SensorStatusItem
  | BrightnessStatusItem
  | VolumeStatusItem
  | LedStatusItem
  | SpacerStatusItem;

/** A button inside a button section — one of the embeddable Ted card types. */
export type RoomButtonConfig = (
  | ButtonCardConfig
  | CoverCardConfig
  | LightCardConfig
  | CameraCardConfig
  | SpacerCardConfig
) &
  RoomButtonSizing;

/** Footprint size of a button in its section grid. */
export type ButtonSize = "half" | "normal" | "2x" | "3x" | "4x" | "full";

/**
 * Per-button layout footprint in a section grid. These reserved keys are stripped
 * by the room card before the embedded sub-card is created, so they never reach
 * the sub-card config. Omitted when "normal" (the default).
 */
export interface RoomButtonSizing {
  /** Width footprint: half / normal / 2x / 3x / 4x / full. Defaults to "normal". */
  ted_button_width?: ButtonSize;
  /** Height footprint: half / normal / 2x / 3x / 4x / full. Defaults to "normal". */
  ted_button_height?: ButtonSize;
}

/** A reorderable section of square buttons (NovaStar Presets layout). */
export interface RoomButtonSection {
  title?: string;
  /** Whether the section title is shown in the rendered card. Defaults to false. */
  show_title?: boolean;
  /** Horizontal alignment of the section title. Defaults to "left". */
  title_align?: "left" | "center" | "right";
  /** Max number of 5-wide rows shown before the "…" overflow button. 0 = unlimited. */
  max_rows?: number;
  buttons: RoomButtonConfig[];
}

export interface RoomCardConfig extends LovelaceCardConfig {
  type: string;
  /** The Home Assistant area this card represents (title default + entity auto-pull). */
  area?: string;
  /** Optional title override (defaults to the area's name). */
  name?: string;
  /** Optional icon shown in the header when `show_header_icon` is on. */
  icon?: string;
  theme?: RoomCardTheme;
  brushed?: boolean;
  /** Appearance: card background color override (theme color name or hex/rgb/hsl/var). */
  background?: string;
  /** Appearance: surface transparency override (0–100%). */
  transparency?: number;
  /** Appearance: backdrop blur override (0–100%). */
  blur?: number;
  /** Header: show the icon. Defaults to false. */
  show_header_icon?: boolean;
  /** Header: icon size override in px. */
  header_icon_size?: number;
  /** Header: show the name. Defaults to true. */
  show_header_name?: boolean;
  /** Header: name size override in px. */
  header_name_size?: number;
  /** Header: show the divider line under the header. Defaults to false. */
  header_divider?: boolean;
  /** Vertical alignment of the header (name/icon) within the status strip. Defaults to "top". */
  header_align?: "top" | "middle" | "bottom";
  /** Vertical alignment of the status items within the status strip. Defaults to "top". */
  status_align?: "top" | "middle" | "bottom";
  /** Status strip icon size in px. Defaults to 16. */
  status_icon_size?: number;
  // --- Room photo ---
  /** Show the room photo behind the card UI. Defaults to true. */
  show_photo?: boolean;
  /** Where the photo comes from. Defaults to "bundled". */
  photo_source?: "bundled" | "custom" | "camera";
  /** Bundled photo key, or "auto" to match the room name. Defaults to "auto". */
  photo?: string;
  /** Custom photo path/URL (from the HA image selector) when source is "custom". */
  photo_url?: string;
  /** Camera entity used as the photo when source is "camera". */
  photo_camera_entity?: string;
  /** Camera view mode for a camera photo. Defaults to "auto" (thumbnail). */
  photo_camera_view?: CameraView;
  /** Fit mode for a camera photo. Defaults to "cover". */
  photo_camera_fit?: FitMode;
  /** Where the photo sits in the card. Defaults to "top". */
  photo_placement?: "top" | "below_header" | "fill";
  /** Cropped photo height in px (top/below_header). Empty = full natural image. */
  photo_height?: number;
  /** Vertical focal point when the photo is cropped. Defaults to "center". */
  photo_align?: "top" | "center" | "bottom";
  /** For "top" placement: pad the body so buttons sit below the photo. Defaults to true. */
  shift_buttons_down?: boolean;
  /** Edges to darken with a legibility scrim. Defaults per placement. */
  photo_edge_gradient?: Array<"top" | "left" | "right" | "bottom">;
  /** Photo opacity (0–100). Defaults to 100. */
  photo_opacity?: number;
  /** Entity (or entities) whose on/off state drives the photo treatment. Dims when all are off. */
  photo_state_entity?: string | string[];
  /** Greyscale the photo while the state entity is off. Defaults to false. */
  photo_off_grayscale?: boolean;
  /** Photo opacity (0–100) while the state entity is off. Defaults to 25. */
  photo_off_opacity?: number;
  /** Items shown in the top STATUS strip. */
  status_items?: RoomStatusItem[];
  /** Button sections rendered below the status strip. */
  sections?: RoomButtonSection[];
}
