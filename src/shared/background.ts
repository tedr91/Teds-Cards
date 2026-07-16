/**
 * Shared Background Wallpaper helpers — the option lists, setting keys, and the
 * CSS mapping used by both the Settings card (editing) and the invisible
 * ted-background-card (applying the wallpaper to the dashboard view).
 *
 * Keys/defaults mirror the backend `SETTINGS_DEFAULTS` (background_* group).
 */

import type { SettingsMap } from "./settings-schema";
import { html, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { css, type CSSResultGroup } from "lit";
import type { SettingsValue } from "./settings-schema";

export type BackgroundMode = "solid" | "image" | "slideshow" | "theme";
export type BackgroundSize = "original" | "fill" | "fit";
export type BackgroundRepeat = "tile" | "no-repeat";
export type BackgroundAlbum = "builtin" | "folder" | "bing_pod";
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
  "background_bing_cache_size",
  "background_enhance_readability",
  "background_readability_strength",
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
  { value: "bing_pod", label: "Bing Photo of the Day" },
];

export const BACKGROUND_TYPE_PREF_OPTIONS: { value: BackgroundTypePref; label: string }[] = [
  { value: "match", label: "On" },
  { value: "all", label: "Off" },
  { value: "light", label: "Force Light" },
  { value: "dark", label: "Force Dark" },
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

/** An optional readability scrim overlaid on top of the wallpaper image (a flat
 *  translucent layer that tones the image toward the theme's contrast). */
export interface BackgroundScrim {
  /** CSS color channels, e.g. "0,0,0" or "255,255,255" (used as `rgba(color, opacity)`). */
  color: string;
  opacity: number;
}

/** A CSS `background` shorthand-ish set of declarations for the given effective
 *  settings and (already-resolved) image URL. Returns null for `theme` mode
 *  (meaning: apply nothing, defer to the HA theme). An optional `scrim` is
 *  composited as the TOP background layer for readability. */
export function backgroundLayerCss(
  s: SettingsMap,
  imageUrl: string | null,
  scrim?: BackgroundScrim,
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
  // A scrim (if any) is a flat gradient composited ABOVE the image. Gradients
  // fill the box at any background-size, so one size/position/repeat covers both.
  const scrimLayer = scrim
    ? `linear-gradient(rgba(${scrim.color},${scrim.opacity}),rgba(${scrim.color},${scrim.opacity})), `
    : "";
  return {
    image: `${scrimLayer}url("${cssEscapeUrl(imageUrl)}")`,
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

// ---------------------------------------------------------------------------
// Image luminance analysis (slideshow "mood matching" filter + readability scrim)
// ---------------------------------------------------------------------------

/** Below this mean luminance (0..1) an image is treated as "dark". */
export const DARK_LUMINANCE_THRESHOLD = 0.45;

const LUMA_SAMPLE = 32;
const _lumaCache = new Map<string, number | null>();
const _lumaInflight = new Map<string, Promise<number | null>>();

/** Mean perceived luminance of an image (0 = black … 1 = white), or null if it
 *  can't be analyzed (decode error / tainted canvas). Cached per URL.
 *
 *  Draws the image into a tiny 32×32 canvas — the browser box-filters the
 *  downscale so the mean of those pixels ≈ the whole-image average — then reads
 *  the pixels back and averages perceived luminance. Wallpaper URLs are usually
 *  same-origin (HA) or CORS-enabled (jsDelivr), so `getImageData` isn't tainted;
 *  `crossOrigin` is set defensively and any failure just yields null. */
export function imageLuminance(url: string): Promise<number | null> {
  const cached = _lumaCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = _lumaInflight.get(url);
  if (pending) return pending;
  const p = _computeLuminance(url).then((v) => {
    _lumaCache.set(url, v);
    _lumaInflight.delete(url);
    return v;
  });
  _lumaInflight.set(url, p);
  return p;
}

/** True if the image is dark, false if light, null if it couldn't be analyzed. */
export function isDarkImage(luminance: number | null): boolean | null {
  return luminance === null ? null : luminance < DARK_LUMINANCE_THRESHOLD;
}

async function _computeLuminance(url: string): Promise<number | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = LUMA_SAMPLE;
    canvas.height = LUMA_SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, LUMA_SAMPLE, LUMA_SAMPLE);

    const { data } = ctx.getImageData(0, 0, LUMA_SAMPLE, LUMA_SAMPLE);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue; // ignore fully transparent pixels
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count++;
    }
    return count ? sum / count / 255 : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Built-in wallpaper catalogue via CDN (so card-only users, without the backend
// integration serving them locally, still get the bundled wallpapers).
// ---------------------------------------------------------------------------

/** jsDelivr base for the bundled wallpapers shipped in the Teds-Cards-Backend repo.
 *  Bump the pinned tag whenever that repo's `backgrounds/` change (mirrors the Room
 *  Card `PHOTO_CDN_BASE`). Serves `index.json` + `<general|light-mode|dark-mode>/<name>`. */
export const BUILTIN_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/tedr91/Teds-Cards-Backend@v1.0.32/custom_components/teds_cards_backend/backgrounds/";

/** Category → the folder it lives in under the backgrounds root. */
const BUILTIN_CDN_DIRS: Record<"general" | "light" | "dark", string> = {
  general: "general",
  light: "light-mode",
  dark: "dark-mode",
};

export interface BuiltinBackgroundLists {
  general: string[];
  light: string[];
  dark: string[];
}

let _cdnBuiltins: BuiltinBackgroundLists | undefined;

/** Fetch the bundled wallpaper catalogue from the CDN (card-only path). Reads a
 *  committed `index.json` of filenames per category and maps them to CDN URLs.
 *  Cached for the session; returns empty lists on any failure. */
export async function listBuiltinBackgroundsCdn(): Promise<BuiltinBackgroundLists> {
  if (_cdnBuiltins) return _cdnBuiltins;
  const empty: BuiltinBackgroundLists = { general: [], light: [], dark: [] };
  try {
    const res = await fetch(`${BUILTIN_CDN_BASE}index.json`);
    if (!res.ok) return empty;
    const idx = (await res.json()) as Partial<Record<"general" | "light" | "dark", string[]>>;
    const map = (cat: "general" | "light" | "dark") =>
      (idx[cat] ?? []).map((name) => `${BUILTIN_CDN_BASE}${BUILTIN_CDN_DIRS[cat]}/${encodeURIComponent(name)}`);
    _cdnBuiltins = { general: map("general"), light: map("light"), dark: map("dark") };
    return _cdnBuiltins;
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Shared Background field UI — rendered by BOTH the Settings card (per-scope)
// and the ted-background-card editor (per-card config). The host supplies a
// context that reads/writes values + implements the media actions.
// ---------------------------------------------------------------------------

export interface BackgroundFieldsCtx {
  /** Read a background_* value in the host's current scope. */
  get(key: string): SettingsValue | undefined;
  /** Write a background_* value. */
  set(key: string, value: SettingsValue): void;
  /** Disable inputs (e.g. non-admin editing Global). */
  disabled: boolean;
  /** Whether the backend integration is available (local built-ins / upload folder). */
  backendAvailable: boolean;
  /** The "Ted Dash System" media folder uri, or null. */
  mediaFolder: string | null;
  /** Resolve a stored image ref to a display URL ("" until an async resolve lands). */
  displayUrl(ref: string): string;
  /** Open the media browser to pick + store an image. */
  selectImage(): void;
  /** Upload a File + store it as the wallpaper. */
  uploadImage(file: File): void;
  /** Clear the single image. */
  clearImage(): void;
  /** Use a recent image as the wallpaper. */
  selectRecent(ref: string): void;
  /** Pick the slideshow folder. */
  pickFolder(): void;
  /** Clear the Bing "Photo of the Day" server cache (admin only; optional). */
  clearBingCache?(): void;
}

/** Set an image as the wallpaper and push it onto the recents MRU (cap 5). */
export function applyBgImage(
  get: (k: string) => SettingsValue | undefined,
  set: (k: string, v: SettingsValue) => void,
  ref: string,
): void {
  set("background_image", ref);
  const recent = stringList(get("background_recent_images"));
  set("background_recent_images", [ref, ...recent.filter((r) => r !== ref)].slice(0, BACKGROUND_RECENT_MAX));
}

function bgSelect(
  ctx: BackgroundFieldsCtx,
  key: string,
  options: { value: string; label: string }[],
): TemplateResult {
  const val = String(ctx.get(key) ?? "");
  // `.value` on the select keeps its DISPLAYED option in sync when the value
  // changes after first render (e.g. the settings store loads async) — `?selected`
  // alone doesn't move a native select's shown value on later updates.
  return html`<select
    class="sel"
    .value=${val}
    ?disabled=${ctx.disabled}
    @change=${(e: Event) => ctx.set(key, (e.target as HTMLSelectElement).value)}
  >
    ${options.map((o) => html`<option value=${o.value} ?selected=${val === o.value}>${o.label}</option>`)}
  </select>`;
}

function bgSwitch(ctx: BackgroundFieldsCtx, key: string): TemplateResult {
  return html`<ha-switch
    .checked=${ctx.get(key) === true}
    .disabled=${ctx.disabled}
    @change=${(e: Event) => ctx.set(key, (e.target as HTMLInputElement).checked)}
  ></ha-switch>`;
}

function bgField(label: string, control: TemplateResult, help?: string): TemplateResult {
  return html`<div class="bg-field">
    <div class="row-label">
      <span>${label}</span>
      ${help ? html`<span class="help">${help}</span>` : nothing}
    </div>
    <div class="row-control">${control}</div>
  </div>`;
}

function bgSolid(ctx: BackgroundFieldsCtx): TemplateResult {
  const color = String(ctx.get("background_color") ?? "#57608E");
  return html`
    ${bgField(
      "Color",
      html`<input
        class="bg-color"
        type="color"
        .value=${color}
        ?disabled=${ctx.disabled}
        @input=${(e: Event) => ctx.set("background_color", (e.target as HTMLInputElement).value)}
      />`,
    )}
    ${bgField("Gradient effect", bgSwitch(ctx, "background_gradient"))}
  `;
}

function bgImage(ctx: BackgroundFieldsCtx): TemplateResult {
  const current = String(ctx.get("background_image") ?? "");
  const recent = stringList(ctx.get("background_recent_images"));
  return html`
    <div class="bg-field">
      <div class="row-label">
        <span>Image</span>
        <span class="help">Choose a recent image, browse media, or upload a new one.</span>
      </div>
      <div class="bg-image-panel">
        ${current
          ? html`<div
              class="bg-preview"
              style=${styleMap({ backgroundImage: ctx.displayUrl(current) ? `url("${ctx.displayUrl(current)}")` : "none" })}
            ></div>`
          : nothing}
        ${recent.length
          ? html`<div class="bg-recents">
              ${recent.map(
                (ref) => html`<button
                  class="bg-thumb ${ref === current ? "on" : ""}"
                  ?disabled=${ctx.disabled}
                  title="Use this image"
                  style=${styleMap({ backgroundImage: ctx.displayUrl(ref) ? `url("${ctx.displayUrl(ref)}")` : "none" })}
                  @click=${() => !ctx.disabled && ctx.selectRecent(ref)}
                ></button>`,
              )}
            </div>`
          : nothing}
        <div class="bg-actions">
          <button class="cam-btn" ?disabled=${ctx.disabled} @click=${() => ctx.selectImage()}>
            <ha-icon icon="mdi:image-search"></ha-icon><span>Select image</span>
          </button>
          <label class="cam-btn ${ctx.disabled ? "disabled" : ""}">
            <ha-icon icon="mdi:upload"></ha-icon><span>Add image</span>
            <input
              type="file"
              accept="image/*"
              ?disabled=${ctx.disabled}
              @change=${(e: Event) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) ctx.uploadImage(f);
                (e.target as HTMLInputElement).value = "";
              }}
            />
          </label>
          ${current
            ? html`<button class="cam-btn" ?disabled=${ctx.disabled} @click=${() => ctx.clearImage()}>
                <ha-icon icon="mdi:close"></ha-icon><span>Clear</span>
              </button>`
            : nothing}
        </div>
      </div>
    </div>
  `;
}

function bgSlideshow(ctx: BackgroundFieldsCtx): TemplateResult {
  const album = String(ctx.get("background_album") ?? "builtin");
  const folder = String(ctx.get("background_folder") ?? ctx.mediaFolder ?? "");
  const cycle = Number(ctx.get("background_cycle_minutes") ?? 30);
  const bingCache = Number(ctx.get("background_bing_cache_size") ?? 100);
  // "Bing Photo of the Day" needs the backend (its feed isn't CORS-accessible).
  const albumOptions = BACKGROUND_ALBUM_OPTIONS.filter(
    (o) => o.value !== "bing_pod" || ctx.backendAvailable,
  );
  return html`
    ${bgField("Album source", bgSelect(ctx, "background_album", albumOptions))}
    ${album === "folder"
      ? bgField(
          "Media folder",
          html`<div class="bg-actions">
            <button class="cam-btn" ?disabled=${ctx.disabled} @click=${() => ctx.pickFolder()}>
              <ha-icon icon="mdi:folder-image"></ha-icon><span>${folder ? "Change folder" : "Select folder"}</span>
            </button>
            ${folder ? html`<span class="help bg-folder">${folder.replace(/^media-source:\/\//, "")}</span>` : nothing}
          </div>`,
          "Pick any image inside the target folder — its whole folder is used.",
        )
      : nothing}
    ${album === "bing_pod"
      ? html`
          ${bgField(
            "Cache size",
            html`<input
                class="num"
                type="number"
                min="1"
                max="500"
                .value=${String(bingCache)}
                ?disabled=${ctx.disabled}
                @change=${(e: Event) =>
                  ctx.set("background_bing_cache_size", Number((e.target as HTMLInputElement).value))}
              /><span class="unit">photos</span>`,
            "Most recent Bing daily photos to keep on the server; oldest are removed.",
          )}
          ${ctx.clearBingCache
            ? bgField(
                "Bing cache",
                html`<div class="bg-actions">
                  <button
                    class="cam-btn"
                    ?disabled=${ctx.disabled}
                    @click=${() => ctx.clearBingCache?.()}
                  >
                    <ha-icon icon="mdi:delete-sweep"></ha-icon><span>Clear cache</span>
                  </button>
                </div>`,
                "Downloaded photos are stored on the server, separate from Built-in.",
              )
            : nothing}
        `
      : nothing}
    ${bgField(
      "Mood matching",
      bgSelect(ctx, "background_type_pref", BACKGROUND_TYPE_PREF_OPTIONS),
      "Prefer images whose brightness matches the current light/dark theme.",
    )}
    ${bgField("Shuffle", bgSwitch(ctx, "background_shuffle"))}
    ${bgField(
      "Cycle duration",
      html`<input
        class="num"
        type="number"
        min="1"
        max="1440"
        .value=${String(cycle)}
        ?disabled=${ctx.disabled}
        @change=${(e: Event) => ctx.set("background_cycle_minutes", Number((e.target as HTMLInputElement).value))}
      /><span class="unit">min</span>`,
    )}
  `;
}

function bgCommon(ctx: BackgroundFieldsCtx): TemplateResult {
  const strength = Number(ctx.get("background_readability_strength") ?? 45);
  const enhance = ctx.get("background_enhance_readability") !== false;
  return html`
    ${bgField("Size", bgSelect(ctx, "background_size", BACKGROUND_SIZE_OPTIONS))}
    ${bgField("Alignment", bgSelect(ctx, "background_align", BACKGROUND_ALIGN_OPTIONS))}
    ${bgField("Repeat", bgSelect(ctx, "background_repeat", BACKGROUND_REPEAT_OPTIONS))}
    ${bgField("Scrollable", bgSwitch(ctx, "background_scroll"), "Scrolls with content instead of staying fixed.")}
    ${bgField(
      "Enhance readability",
      bgSwitch(ctx, "background_enhance_readability"),
      "Tone the wallpaper toward the theme so overlaid content stays legible.",
    )}
    ${enhance
      ? bgField(
          "Readability strength",
          html`<div class="pct">
            <input
              type="range"
              min="0"
              max="100"
              .value=${String(strength)}
              ?disabled=${ctx.disabled}
              @input=${(e: Event) => ctx.set("background_readability_strength", Number((e.target as HTMLInputElement).value))}
            />
            <span class="pct-val">${strength}%</span>
          </div>`,
        )
      : nothing}
  `;
}

/** Render the Background field stack (Mode + solid/image/slideshow + common). */
export function renderBackgroundFields(ctx: BackgroundFieldsCtx): TemplateResult {
  const mode = (ctx.get("background_mode") as BackgroundMode) ?? "solid";
  return html`
    ${bgField("Mode", bgSelect(ctx, "background_mode", BACKGROUND_MODE_OPTIONS))}
    ${mode === "solid" ? bgSolid(ctx) : nothing}
    ${mode === "image" ? bgImage(ctx) : nothing}
    ${mode === "slideshow" ? bgSlideshow(ctx) : nothing}
    ${mode === "image" || mode === "slideshow" ? bgCommon(ctx) : nothing}
  `;
}

/** Styles for the Background field stack (used by the ted-background-card editor;
 *  the Settings card already carries equivalent rules). */
export const backgroundFieldsStyles: CSSResultGroup = css`
  .bg-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    min-height: 40px;
  }
  .bg-field .row-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .bg-field .row-label > span:first-child {
    font-weight: 500;
  }
  .bg-field .help {
    font-size: 0.78rem;
    color: var(--secondary-text-color);
  }
  .row-control {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .sel,
  .num {
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font: inherit;
  }
  .num {
    width: 84px;
  }
  .unit {
    font-size: 0.85rem;
    color: var(--secondary-text-color);
  }
  .bg-color {
    width: 48px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 8px;
    background: none;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pct-val {
    min-width: 40px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .bg-image-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    min-width: 0;
  }
  .bg-preview {
    width: 160px;
    height: 90px;
    border-radius: 8px;
    background-size: cover;
    background-position: center;
    border: 1px solid var(--divider-color, #ccc);
  }
  .bg-recents {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .bg-thumb {
    width: 48px;
    height: 32px;
    border-radius: 6px;
    background-size: cover;
    background-position: center;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .bg-thumb.on {
    border-color: var(--primary-color);
  }
  .bg-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
  }
  .cam-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--divider-color, #ccc);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
  }
  .cam-btn.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
  .cam-btn input[type="file"] {
    display: none;
  }
  .bg-folder {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
