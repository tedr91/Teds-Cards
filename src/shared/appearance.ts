/**
 * Shared "Appearance (general)" helpers: a per-card **Transparency** (0–100%) and
 * **Background blur** (0–100%) override that compose with the card's background
 * color.
 *
 * Mechanism: the card's surface is alpha-faded with `color-mix`, driven by the
 * `--ted-card-bg-alpha` custom property the theme reads (or an inline color-mix
 * when a custom background color is set), and a `backdrop-filter: blur()` lets the
 * dashboard show through. At the default (unset / 0) the output is identical to no
 * override — `color-mix(in srgb, X 100%, transparent)` equals `X`.
 */

/** 100% blur maps to this many px of backdrop blur. */
export const MAX_BLUR_PX = 24;

function clampPct(value?: number): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

/**
 * Inline style entries implementing the transparency + blur overrides. Pass the
 * card's already-resolved background color (if one is configured/active). Returns
 * CSS custom properties / properties to merge into the card's `styleMap`.
 */
export function appearanceStyle(opts: {
  background?: string;
  transparency?: number;
  blur?: number;
}): Record<string, string> {
  const style: Record<string, string> = {};
  const transparency = clampPct(opts.transparency);
  const blur = clampPct(opts.blur);

  if (transparency != null && transparency > 0) {
    const alpha = 100 - transparency;
    // Drives the theme's default-surface alpha (used when no custom color is set).
    style["--ted-card-bg-alpha"] = `${alpha}%`;
    if (opts.background) {
      style.background = `color-mix(in srgb, ${opts.background} ${alpha}%, transparent)`;
    }
    // A fully-transparent card has no surface, so drop its border + shadow too.
    if (transparency >= 100) {
      style.border = "none";
      style["box-shadow"] = "none";
    }
  } else if (opts.background) {
    style.background = opts.background;
  }

  if (blur != null && blur > 0) {
    const px = (blur / 100) * MAX_BLUR_PX;
    style["backdrop-filter"] = `blur(${px}px)`;
    style["-webkit-backdrop-filter"] = `blur(${px}px)`;
  }
  return style;
}

/**
 * Apply a transparency override to an already-resolved background color. Returns
 * the color unchanged when transparency is unset/0 (so behavior is identical to
 * before). Used by cards that set `background-color` directly (e.g. light/cover).
 */
export function fadeColor(color: string, transparency?: number): string {
  const t = clampPct(transparency);
  if (t == null || t <= 0) return color;
  return `color-mix(in srgb, ${color} ${100 - t}%, transparent)`;
}

/**
 * ha-form schema grid for the Transparency + Background blur number boxes. They
 * are plain number inputs (not sliders) so they can be left **empty** to mean
 * "no override" — distinct from an explicit `0`, which a slider can't express
 * (its thumb is always at some value).
 */
export function transparencyBlurSchema(): Record<string, unknown> {
  return {
    type: "grid",
    name: "",
    schema: [
      {
        name: "transparency",
        selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
      },
      {
        name: "blur",
        selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
      },
    ],
  };
}

/** Editor label for a shared appearance field, or undefined if it isn't one. */
export function appearanceLabel(name: string): string | undefined {
  switch (name) {
    case "transparency":
      return "Transparency";
    case "blur":
      return "Background blur";
    default:
      return undefined;
  }
}
