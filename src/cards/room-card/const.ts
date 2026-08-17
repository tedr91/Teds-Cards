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
  "https://cdn.jsdelivr.net/gh/tedr91/Teds-Cards@v0.9.158/images/room-header-photos/";

/** Curated bundled photos: dropdown key → source filename. */
export const BUNDLED_PHOTOS: Record<string, string> = {
  bathroom: "Bathroom.webp",
  bathroom_alt: "Bathroom Alt.webp",
  bathroom_alt2: "Bathroom Alt 2.webp",
  bathroom_alt3: "Bathroom Alt 3.webp",
  bathroom_alt4: "Bathroom Alt 4.webp",
  bedroom: "Bedroom.webp",
  bedroom_alt: "Bedroom Alt.webp",
  bedroom_alt2: "Bedroom Alt 2.webp",
  bedroom_alt3: "Bedroom Alt 3.webp",
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
  // Generic fallback for rooms whose name doesn't match any specific type.
  unknown: "Unknown.webp",
  unknown_alt: "Unknown Alt.webp",
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
  { value: "bedroom_alt", label: "Bedroom (Alt 1)" },
  { value: "bedroom_alt2", label: "Bedroom (Alt 2)" },
  { value: "bedroom_alt3", label: "Bedroom (Alt 3)" },
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
  { value: "unknown", label: "Generic" },
  { value: "unknown_alt", label: "Generic (Alt)" },
];

/** Build a full CDN URL for a bundled photo filename. */
export function bundledPhotoUrl(file: string): string {
  return PHOTO_CDN_BASE + encodeURIComponent(file);
}

/** Keyword → photo type rules for Auto matching. Each type lists the room-name
 *  keywords that map to it; the LONGEST matched keyword wins (most specific), so
 *  e.g. "master bathroom" → bathroom (not bedroom via "master"). Matched on whole
 *  words (word boundaries), case-insensitive. Order breaks ties. */
const PHOTO_MATCH_RULES: { type: string; keywords: string[] }[] = [
  {
    type: "bathroom",
    keywords: ["bathroom", "bath", "powder room", "powder", "ensuite", "en-suite", "en suite", "washroom", "restroom", "lavatory", "half bath"],
  },
  {
    type: "bedroom",
    keywords: ["bedroom", "bed", "master", "primary suite", "primary", "guest room", "guest", "nursery", "kids", "kid", "children", "bunk", "dorm"],
  },
  { type: "kitchen", keywords: ["kitchenette", "kitchen", "pantry"] },
  { type: "dining_room", keywords: ["dining room", "dining", "dinette"] },
  {
    type: "living_room",
    keywords: ["living room", "living", "lounge", "sitting room", "sitting", "great room", "parlor", "parlour"],
  },
  { type: "office", keywords: ["office", "study", "den", "library", "workspace"] },
  {
    type: "media_room",
    keywords: ["home theater", "home theatre", "media room", "media", "theater", "theatre", "cinema", "screening"],
  },
  {
    type: "family_room",
    keywords: ["family room", "family", "rec room", "recreation", "playroom", "play room"],
  },
  { type: "bonus_room", keywords: ["bonus room", "bonus", "loft", "flex room", "flex"] },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The photo TYPE + fit weight for a single name via the keyword rules, or undefined
 *  when nothing matches. Most-specific (longest) keyword wins, and its LENGTH is the
 *  weight so a stronger name (e.g. "Primary Bedroom") outranks a weaker one for the
 *  main photo. A possessive name with no other keyword ("Bill's Room") is a low-weight
 *  bedroom. */
export function scorePhotoType(name: string): { type: string; weight: number } | undefined {
  const n = name.toLowerCase();
  let best: { type: string; weight: number } | undefined;
  for (const rule of PHOTO_MATCH_RULES) {
    for (const kw of rule.keywords) {
      if (new RegExp(`\\b${escapeRe(kw)}\\b`, "i").test(n) && (!best || kw.length > best.weight)) {
        best = { type: rule.type, weight: kw.length };
      }
    }
  }
  if (best) return best;
  if (/['’]s\b/.test(n) && /\broom\b/.test(n)) return { type: "bedroom", weight: 1 };
  return undefined;
}

/** The photo type + fit weight for a name, falling back to the generic "unknown" type
 *  (weight 0) so every room resolves to a category. */
export function photoTypeFor(name: string): { type: string; weight: number } {
  return scorePhotoType(name) ?? { type: "unknown", weight: 0 };
}

/** All bundled photo keys for a type: the main (base) key first, then its alts sorted. */
export function variantKeysForType(type: string): string[] {
  const alts = Object.keys(BUNDLED_PHOTOS)
    .filter((k) => k.startsWith(`${type}_alt`))
    .sort();
  return [type, ...alts].filter((k) => k in BUNDLED_PHOTOS);
}

/** Standalone best-guess bundled photo key for a room/area name (no cross-room
 *  coordination): always the category's MAIN photo, falling back to the generic
 *  "unknown" photo so no card is left blank. Used before/without the shared assigner;
 *  the assigner (see photo-assign.ts) handles main-vs-alt distribution across rooms. */
export function autoMatchPhotoKey(name?: string, areaName?: string): string | undefined {
  const candidates = [name, areaName].filter((s): s is string => !!s && !!s.trim());
  for (const c of candidates) {
    const s = scorePhotoType(c);
    if (s) return s.type;
  }
  return "unknown";
}

/** Edge-gradient set applied by default per placement (when not explicitly set). */
export function defaultEdgeGradient(placement: PhotoPlacement): PhotoEdge[] {
  if (placement === "fill") return ["top", "bottom"];
  if (placement === "top") return ["top"];
  return [];
}
