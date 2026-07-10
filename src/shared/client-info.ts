/**
 * Single source of truth for this browser's client characteristics (viewport
 * size, orientation and derived form factor). Reported to the backend on device
 * registration so server-side logic and dashboards can reason about the screen.
 */

/** Short-edge (CSS px) at or below which a device is treated as "small" (phone-class). */
export const SMALL_SHORT_EDGE = 600;

export type ClientOrientation = "portrait" | "landscape";

export type ClientFormFactor =
  | "portrait-small"
  | "portrait-large"
  | "landscape-small"
  | "landscape-large";

export interface ClientInfo {
  width: number;
  height: number;
  orientation: ClientOrientation;
  form_factor: ClientFormFactor;
}

/** Current viewport size, orientation and derived (geometric) form factor. */
export function clientInfo(): ClientInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const orientation: ClientOrientation = height > width ? "portrait" : "landscape";
  const small = Math.min(width, height) <= SMALL_SHORT_EDGE;
  const form_factor: ClientFormFactor =
    orientation === "portrait"
      ? small
        ? "portrait-small"
        : "portrait-large"
      : small
        ? "landscape-small"
        : "landscape-large";
  return { width, height, orientation, form_factor };
}
