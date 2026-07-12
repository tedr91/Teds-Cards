/**
 * Shared Background Wallpaper helpers — the option lists, setting keys, and the
 * CSS mapping used by both the Settings card (editing) and the invisible
 * ted-background-card (applying the wallpaper to the dashboard view).
 *
 * Keys/defaults mirror the backend `SETTINGS_DEFAULTS` (background_* group).
 */

import type { SettingsMap } from "./settings-schema";

export type BackgroundMode = "solid" | "image" | "slideshow" | "theme";
export type BackgroundSize = "original" | "fill" | "fit";
export type BackgroundRepeat = "tile" | "no-repeat";
export type BackgroundAlbum = "builtin" | "folder";
export type BackgroundTypePref = "match" | "all" | "light" | "dark";
export type BackgroundAlign =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Every setting key this feature reads/writes. */
export const BACKGROUND_KEYS = [
  "background_mode",
  "background_scroll",
  "background_size",
  "background_align",
  "background_repeat",
  "background_color",
  "background_gradient",
  "background_image",
  "background_recent_images",
  "background_album",
  "background_folder",
  "background_type_pref",
  "background_shuffle",
  "background_cycle_minutes",
] as const;

/** How many recent single-image picks to remember. */
export const BACKGROUND_RECENT_MAX = 5;

export const BACKGROUND_MODE_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: "solid", label: "Solid Color" },
  { value: "image", label: "Single Image" },
  { value: "slideshow", label: "Slideshow" },
  { value: "theme", label: "HA Theme" },
];

export const BACKGROUND_SIZE_OPTIONS: { value: BackgroundSize; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "fill", label: "Fill view" },
  { value: "fit", label: "Fit view" },
];

export const BACKGROUND_ALIGN_OPTIONS: { value: BackgroundAlign; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "center-left", label: "Center left" },
  { value: "center", label: "Center" },
  { value: "center-right", label: "Center right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export const BACKGROUND_REPEAT_OPTIONS: { value: BackgroundRepeat; label: string }[] = [
  { value: "tile", label: "Tile" },
  { value: "no-repeat", label: "No repeat" },
];

export const BACKGROUND_ALBUM_OPTIONS: { value: BackgroundAlbum; label: string }[] = [
  { value: "builtin", label: "Built-in" },
  { value: "folder", label: "Select media folder" },
];

export const BACKGROUND_TYPE_PREF_OPTIONS: { value: BackgroundTypePref; label: string }[] = [
  { value: "match", label: "Attempt to match theme" },
  { value: "all", label: "All" },
  { value: "light", label: "Light only" },
  { value: "dark", label: "Dark only" },
];

/** CSS `background-size` for a size option. */
export function sizeToCss(size: BackgroundSize): string {
  if (size === "fill") return "cover";
  if (size === "fit") return "contain";
  return "auto";
}

/** CSS `background-position` for a 9-way alignment option. */
export function alignToCss(align: BackgroundAlign): string {
  const [v, h] = align.split("-");
  const horizontal = h ?? "center";
  return `${horizontal} ${v}`;
}

/** CSS `background-repeat` for a repeat option (only meaningful at original size). */
export function repeatToCss(repeat: BackgroundRepeat): string {
  return repeat === "tile" ? "repeat" : "no-repeat";
}

/** CSS `background-attachment` — false = fixed (doesn't scroll with content). */
export function attachmentToCss(scroll: boolean): string {
  return scroll ? "scroll" : "fixed";
}

/** A subtle diagonal gradient derived from a base color, for the Solid Color mode.
 *  Mirrors the NovaStar / AV Receiver "Ted's Home Theater" card surface — a 145°
 *  three-stop diagonal that steps the picked colour darker (same 74% / 48% luminance
 *  ratios as `linear-gradient(145deg, #2e2e32, #222226 45%, #16161a)`). */
export function solidGradient(color: string, gradient: boolean): string {
  if (!gradient) return color;
  return (
    `linear-gradient(145deg, ${color} 0%, ` +
    `color-mix(in srgb, ${color} 74%, #000) 45%, ` +
    `color-mix(in srgb, ${color} 48%, #000) 100%)`
  );
}

/** Read a string[] setting safely. */
export function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** A CSS `background` shorthand-ish set of declarations for the given effective
 *  settings and (already-resolved) image URL. Returns null for `theme` mode
 *  (meaning: apply nothing, defer to the HA theme). */
export function backgroundLayerCss(
  s: SettingsMap,
  imageUrl: string | null,
): { image: string; size: string; position: string; repeat: string; attachment: string; color: string } | null {
  const mode = (s.background_mode as BackgroundMode) ?? "solid";
  if (mode === "theme") return null;

  const size = (s.background_size as BackgroundSize) ?? "fill";
  const align = (s.background_align as BackgroundAlign) ?? "center";
  const repeat = (s.background_repeat as BackgroundRepeat) ?? "tile";
  const scroll = s.background_scroll === true;

  const attachment = attachmentToCss(scroll);
  const position = alignToCss(align);
  // Repeat only applies when the image isn't stretched to cover/contain.
  const cssRepeat = size === "original" ? repeatToCss(repeat) : "no-repeat";
  const cssSize = sizeToCss(size);

  if (mode === "solid") {
    const color = typeof s.background_color === "string" ? s.background_color : "#57608E";
    const gradient = s.background_gradient !== false;
    return {
      image: solidGradient(color, gradient),
      size: "auto",
      position: "center center",
      repeat: "no-repeat",
      attachment,
      color,
    };
  }

  // image / slideshow — need a resolved URL.
  if (!imageUrl) {
    return { image: "none", size: cssSize, position, repeat: cssRepeat, attachment, color: "transparent" };
  }
  return {
    image: `url("${cssEscapeUrl(imageUrl)}")`,
    size: cssSize,
    position,
    repeat: cssRepeat,
    attachment,
    color: "transparent",
  };
}

/** Escape characters that would break a CSS url("…"). */
export function cssEscapeUrl(url: string): string {
  return url.replace(/["\\]/g, "\\$&");
}
