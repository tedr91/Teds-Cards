import { NAMESPACE } from "../../shared/const";

export const ROOM_CARD_TYPE = `${NAMESPACE}-room-card`;
export const ROOM_CARD_EDITOR_TYPE = `${ROOM_CARD_TYPE}-editor`;
export const ROOM_CARD_NAME = "Ted Room Card";
export const ROOM_CARD_DESCRIPTION =
  "Room dashboard — a status strip plus reorderable sections of light, cover, and button cards.";

/** Embeddable button card types, as Lovelace `custom:` config types. */
export const ROOM_BUTTON_CARD_TYPES = {
  label: `custom:${NAMESPACE}-button-card`,
  cover: `custom:${NAMESPACE}-cover-card`,
  light: `custom:${NAMESPACE}-light-card`,
  camera: `custom:${NAMESPACE}-camera-card`,
  spacer: `custom:${NAMESPACE}-spacer-card`,
} as const;

/**
 * Status-item icon/label/display defaults live in the shared `status-items`
 * module; re-exported here so the Room Card runtime + editor keep importing them
 * from "./const".
 */
export {
  STATUS_ITEM_DEFAULT_ICON,
  STATUS_ITEM_LABEL,
  STATUS_ITEM_DEFAULT_DISPLAY,
} from "../../shared/status-items/const";

// --- Room photo -----------------------------------------------------------

export type PhotoPlacement = "top" | "below_header" | "fill";
export type PhotoEdge = "top" | "left" | "right" | "bottom";

/** Default cropped photo height (px) for "top" / "below header" placements when unset. */
export const DEFAULT_PHOTO_HEIGHT = 132;

/**
 * Base URL for the bundled room photos, served from jsDelivr pinned to a tag
 * (immutable + CDN-cached). Bump the tag if more photos are added later.
 */
export const PHOTO_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/tedr91/Teds-Cards@v1.0.136/images/room-header-photos/";

/** Curated bundled photos: dropdown key → source filename. */
export const BUNDLED_PHOTOS: Record<string, string> = {
  bathroom: "Bathroom.jpg",
  bathroom_alt: "Bathroom Alt.jpg",
  bathroom_alt2: "Bathroom Alt 2.jpg",
  bathroom_alt3: "Bathroom Alt 3.jpg",
  bathroom_alt4: "Bathroom Alt 4.jpg",
  bedroom: "Bedroom.jpg",
  bonus_room: "Bonus Room.jpg",
  dining_room: "Dining Room.jpg",
  family_room: "Family Room.jpg",
  kitchen: "Kitchen.jpg",
  kitchen_alt: "Kitchen Alt.jpg",
  living_room: "Living Room.jpg",
  media_room: "Media Room.jpg",
  media_room_alt: "Media Room Alt.jpg",
  office: "Office.jpg",
  office_alt: "Office Alt.jpeg",
};

/** Dropdown options (Auto + curated) for the editor's bundled-photo selector. */
export const BUNDLED_PHOTO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto (match room name)" },
  { value: "bathroom", label: "Bathroom" },
  { value: "bathroom_alt", label: "Bathroom (Alt)" },
  { value: "bathroom_alt2", label: "Bathroom (Alt 2)" },
  { value: "bathroom_alt3", label: "Bathroom (Alt 3)" },
  { value: "bathroom_alt4", label: "Bathroom (Alt 4)" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bonus_room", label: "Bonus Room" },
  { value: "dining_room", label: "Dining Room" },
  { value: "family_room", label: "Family Room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "kitchen_alt", label: "Kitchen (Alt)" },
  { value: "living_room", label: "Living Room" },
  { value: "media_room", label: "Media Room" },
  { value: "media_room_alt", label: "Media Room (Alt)" },
  { value: "office", label: "Office" },
  { value: "office_alt", label: "Office (Alt)" },
];

/** Build a full CDN URL for a bundled photo filename. */
export function bundledPhotoUrl(file: string): string {
  return PHOTO_CDN_BASE + encodeURIComponent(file);
}

/** Best-guess bundled photo key from a room/area name (undefined when no match). */
export function autoMatchPhotoKey(name?: string): string | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (n.includes("bath")) return "bathroom";
  if (n.includes("bed")) return "bedroom";
  if (n.includes("kitchen")) return "kitchen";
  if (n.includes("living")) return "living_room";
  if (n.includes("dining")) return "dining_room";
  if (n.includes("office")) return "office";
  if (n.includes("media") || n.includes("theater") || n.includes("theatre") || n.includes("cinema"))
    return "media_room";
  if (n.includes("family")) return "family_room";
  if (n.includes("bonus")) return "bonus_room";
  return undefined;
}

/** Edge-gradient set applied by default per placement (when not explicitly set). */
export function defaultEdgeGradient(placement: PhotoPlacement): PhotoEdge[] {
  if (placement === "fill") return ["top", "bottom"];
  if (placement === "top") return ["top"];
  return [];
}
