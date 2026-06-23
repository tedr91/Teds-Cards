import { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";
import type { CoverCardConfig } from "../cover-card/types";
import type { LightCardConfig } from "../light-card/types";
import type { LabelButtonCardConfig } from "../label-button-card/types";
import type { SpacerCardConfig } from "../spacer-card/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type RoomCardTheme = TedStyleTheme;

/** The kinds of items the STATUS strip can hold. */
export type RoomStatusItemType =
  | "temperature"
  | "occupancy"
  | "brightness"
  | "volume"
  | "led"
  | "spacer";

/** Fields shared by every status item. */
interface RoomStatusItemBase {
  type: RoomStatusItemType;
  /** Optional label (tooltip / a11y); falls back to the entity's friendly name. */
  name?: string;
}

/**
 * Temperature / occupancy: an icon plus the entity's value. `entity` is optional —
 * when omitted it is resolved from the card's `area`.
 */
export interface RoomSensorStatusItem extends RoomStatusItemBase {
  type: "temperature" | "occupancy";
  entity?: string;
  icon?: string;
}

/**
 * Brightness slider (NovaStar-style). Targets a light (on/off + brightness %) or a
 * number / input_number entity (min/max/step → set_value), auto-detected by domain.
 */
export interface RoomBrightnessStatusItem extends RoomStatusItemBase {
  type: "brightness";
  entity: string;
  icon?: string;
}

/** Volume control (Denon-style): tap opens a slider, double-tap mutes. Targets a media_player. */
export interface RoomVolumeStatusItem extends RoomStatusItemBase {
  type: "volume";
  entity: string;
  icon?: string;
}

/**
 * Status LED: a small colored dot. On/active = green, off = grey by default;
 * `on_color`/`off_color` override those, and `colors` maps specific states to colors.
 */
export interface RoomLedStatusItem extends RoomStatusItemBase {
  type: "led";
  entity: string;
  on_color?: string;
  off_color?: string;
  colors?: Record<string, string>;
}

/** A transparent fixed-width gap in the status strip. */
export interface RoomSpacerStatusItem extends RoomStatusItemBase {
  type: "spacer";
  /** Width of the gap in px. Defaults to 24. */
  size?: number;
}

export type RoomStatusItem =
  | RoomSensorStatusItem
  | RoomBrightnessStatusItem
  | RoomVolumeStatusItem
  | RoomLedStatusItem
  | RoomSpacerStatusItem;

/** A button inside a button section — one of the embeddable Ted card types. */
export type RoomButtonConfig = LabelButtonCardConfig | CoverCardConfig | LightCardConfig | SpacerCardConfig;

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
  /** Header: show the icon. Defaults to false. */
  show_header_icon?: boolean;
  /** Header: icon size override in px. */
  header_icon_size?: number;
  /** Header: show the name. Defaults to true. */
  show_header_name?: boolean;
  /** Header: name size override in px. */
  header_name_size?: number;
  /** Header: show the divider line under the header. Defaults to true. */
  header_divider?: boolean;
  /** Items shown in the top STATUS strip. */
  status_items?: RoomStatusItem[];
  /** Button sections rendered below the status strip. */
  sections?: RoomButtonSection[];
}
