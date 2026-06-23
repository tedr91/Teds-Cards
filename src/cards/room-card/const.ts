import { NAMESPACE } from "../../shared/const";
import type { RoomStatusItemType } from "./types";

export const ROOM_CARD_TYPE = `${NAMESPACE}-room-card`;
export const ROOM_CARD_EDITOR_TYPE = `${ROOM_CARD_TYPE}-editor`;
export const ROOM_CARD_NAME = "Ted Room Card";
export const ROOM_CARD_DESCRIPTION =
  "Room dashboard — a status strip plus reorderable sections of light, cover, and button cards.";

/** Embeddable button card types, as Lovelace `custom:` config types. */
export const ROOM_BUTTON_CARD_TYPES = {
  label: `custom:${NAMESPACE}-label-button-card`,
  cover: `custom:${NAMESPACE}-cover-card`,
  light: `custom:${NAMESPACE}-light-card`,
  spacer: `custom:${NAMESPACE}-spacer-card`,
} as const;

/** Default icon per status item type. */
export const STATUS_ITEM_DEFAULT_ICON: Record<RoomStatusItemType, string> = {
  temperature: "mdi:thermometer",
  occupancy: "mdi:motion-sensor",
  brightness: "mdi:brightness-6",
  volume: "mdi:volume-high",
  led: "mdi:led-on",
  spacer: "mdi:arrow-expand-horizontal",
};

/** Human-readable label per status item type (used in editor menus). */
export const STATUS_ITEM_LABEL: Record<RoomStatusItemType, string> = {
  temperature: "Temperature",
  occupancy: "Occupancy",
  brightness: "Brightness control",
  volume: "Volume control",
  led: "Status LED",
  spacer: "Spacer",
};
