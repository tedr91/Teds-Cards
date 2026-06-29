import type { HomeAssistant } from "custom-card-helpers";

/**
 * Navigate using the View Assist integration's `view_assist.navigate` service so
 * the destination honours the current device's configured screens.
 *
 * The current device is resolved from the `view_assist_sensor` entity id that
 * View Assist stores in `localStorage`. On a real View Assist device the
 * integration is asked to navigate (which also drives browser_mod / remote
 * assist display targets); on a normal browser (no `view_assist_sensor`) the
 * card falls back to a standard client-side dashboard navigation.
 *
 * `view` is the logical name `home` — resolved by the integration to the
 * device's configured Home screen — or a view slug such as `music`, navigated
 * relative to the device's configured dashboard base.
 *
 * This only ever runs in response to a user action, never at load/render, so it
 * has no effect for users who don't use View Assist.
 */
export function viewAssistNavigate(hass: HomeAssistant | undefined, view: string): void {
  let sensor: string | null = null;
  try {
    sensor = localStorage.getItem("view_assist_sensor");
  } catch {
    sensor = null;
  }

  const state = sensor && hass ? hass.states[sensor] : undefined;
  if (hass && sensor && state) {
    const dashboard =
      (typeof state.attributes.dashboard === "string" && state.attributes.dashboard) ||
      "/view-assist";
    const path = view === "home" ? "home" : `${dashboard}/${view}`;
    hass.callService("view_assist", "navigate", { device: sensor, path });
    return;
  }

  // Not a View Assist device — fall back to a normal dashboard navigation.
  const target = view === "home" ? "/view-assist/clock" : `/view-assist/${view}`;
  window.history.pushState(null, "", target);
  window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
}
