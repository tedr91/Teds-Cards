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
 * (immutable + CDN-cached). Now a CARD-ONLY fallback: when TDS is installed the
 * photos are served locally (see src/shared/room-photos.ts); this is only hit by
 * card-only users with no backend. Must be bumped in lockstep with `_CDN_BASE`
 * in Teds-Dashboard-System/custom_components/teds_dashboard_system/room_photos.py
 * whenever the photo filenames change (the pinned tag must already contain them).
 */
export const PHOTO_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/tedr91/Teds-Cards@v0.9.133/images/room-header-photos/";

/** Curated bundled photos: dropdown key → source filename. */
export const BUNDLED_PHOTOS: Record<string, string> = {
  bathroom: "Bathroom.webp",
  bathroom_alt: "Bathroom Alt.webp",
  bathroom_alt2: "Bathroom Alt 2.webp",
  bathroom_alt3: "Bathroom Alt 3.webp",
  bathroom_alt4: "Bathroom Alt 4.webp",
  bedroom: "Bedroom.webp",
  bonus_room: "Bonus Room.webp",
  dining_room: "Dining Room.webp",
  family_room: "Family Room.webp",
  kitchen: "Kitchen.webp",
  kitchen_alt: "Kitchen Alt.webp",
  living_room: "Living Room.webp",
  media_room: "Media Room.webp",
  media_room_alt: "Media Room Alt.webp",
  office: "Office.webp",
  office_alt: "Office Alt.webp",
};

/** Every bundled photo filename — the manifest handed to the backend downloader. */
export const BUNDLED_PHOTO_FILES: string[] = Object.values(BUNDLED_PHOTOS);

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
