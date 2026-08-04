/**
 * Helpers for embedding Home Assistant's built-in camera renderer.
 *
 * Cards in this collection reuse HA's internal `<hui-image>` element — the same
 * primitive the built-in picture-glance card uses — so a camera feed gets both
 * "auto" thumbnail polling and "live" streaming, plus fit-mode and error / spinner
 * handling, for free. That element ships with the Lovelace bundle and is only
 * registered on demand, so this module makes sure it is defined before a card
 * tries to render it.
 */

import type { LovelaceCard, LovelaceCardConfig } from "custom-card-helpers";

/** How the camera image updates: periodic thumbnail vs. continuous live stream. */
export type CameraView = "auto" | "live";

/** How the camera image fits its box (mirrors picture-glance's `fit_mode`). */
export type FitMode = "cover" | "contain" | "fill";

/** Relative stream resolution requested for a tile, based on its size/role. */
export type StreamQuality = "low" | "medium" | "high";

/** Entity-id suffixes used to detect sibling substreams, per quality tier. Covers
 *  common integrations: UniFi Protect (`_high/_medium/_low`), Reolink
 *  (`_clear/_balanced/_fluent` and `_<q>_resolution_channel`), go2rtc/generic
 *  (`_main/_sub`). Longer/more-specific suffixes are listed first so base-id
 *  stripping matches them before the short forms. */
export const QUALITY_SUFFIXES: Record<StreamQuality, string[]> = {
  high: ["high_resolution_channel", "high_resolution", "high", "clear", "main", "hd"],
  medium: ["medium_resolution_channel", "medium_resolution", "medium", "balanced", "mid", "sd"],
  low: ["low_resolution_channel", "low_resolution", "low", "fluent", "sub", "ld"],
};

/** The quality tier a camera entity id encodes via its suffix, or `undefined`
 *  when it carries no recognized suffix (treated as the main/high feed). */
export function streamQualityOf(entityId: string): StreamQuality | undefined {
  const lower = entityId.toLowerCase();
  for (const quality of ["high", "medium", "low"] as StreamQuality[]) {
    if (QUALITY_SUFFIXES[quality].some((suffix) => lower.endsWith(`_${suffix}`))) return quality;
  }
  return undefined;
}

/** Strip a known quality suffix from an entity id to get its shared base, so
 *  siblings like `camera.front_high`/`_medium`/`_low` all resolve to `camera.front`. */
export function substreamBase(entityId: string): string {
  const lower = entityId.toLowerCase();
  for (const quality of ["high", "medium", "low"] as StreamQuality[]) {
    for (const suffix of QUALITY_SUFFIXES[quality]) {
      if (lower.endsWith(`_${suffix}`)) return entityId.slice(0, -(suffix.length + 1));
    }
  }
  return entityId;
}

/**
 * The slim slice of HA's card helpers we use to force the camera element to load.
 * Structurally matches the room card's own declaration so the global `Window`
 * augmentation merges cleanly.
 */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/** Cached single-flight promise so the registration work only ever runs once. */
let huiImagePromise: Promise<boolean> | undefined;

/**
 * Ensure HA's internal `<hui-image>` custom element is registered.
 *
 * Resolves to `true` once the element is defined. The work is done once and
 * cached, so repeated calls are cheap. If the card helpers are unavailable the
 * promise resolves to `false` and callers should render a graceful placeholder.
 */
export function ensureHuiImage(): Promise<boolean> {
  if (customElements.get("hui-image")) return Promise.resolve(true);
  if (huiImagePromise) return huiImagePromise;

  huiImagePromise = (async () => {
    // Loading the card helpers pulls in the Lovelace bundle, which usually
    // registers `<hui-image>` as a side effect.
    const load = window.loadCardHelpers;
    if (!load) return false;
    try {
      const helpers = await load();
      if (!customElements.get("hui-image")) {
        // Belt-and-suspenders: building any built-in picture card imports the
        // `<hui-image>` module, registering the element.
        helpers.createCardElement({
          type: "picture-glance",
          entities: [],
          camera_image: "camera.unavailable",
        });
        // Never hang — fall through after a short grace period if needed.
        await Promise.race([
          customElements.whenDefined("hui-image"),
          new Promise((resolve) => window.setTimeout(resolve, 2000)),
        ]);
      }
      return Boolean(customElements.get("hui-image"));
    } catch {
      // Reset so a later call can retry after a transient failure.
      huiImagePromise = undefined;
      return false;
    }
  })();

  return huiImagePromise;
}
