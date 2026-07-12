/**
 * Shared action dispatch for Ted's Cards: the single source of truth for running
 * a tap / hold / double-tap `ActionConfig`, used by the Button Card and the shared
 * status items (Navbar / Room card read-outs). Mirrors Home Assistant's built-in
 * button behaviour plus two Ted's extras: a corrected `toggle` (handles scenes,
 * buttons, valves, …) and the `navigate-dashboard` action that resolves a dashboard
 * path from the Ted's Cards Backend settings at tap time.
 */
import {
  type ActionConfig,
  type HomeAssistant,
  computeDomain,
  forwardHaptic,
  handleAction,
  hasAction,
} from "custom-card-helpers";

import { resolveDashboardPath } from "./settings";

/** Detect whether an `ActionConfig` will do anything (re-exported for callers). */
export function hasTedAction(config?: ActionConfig): boolean {
  return hasAction(config);
}

/** States Home Assistant treats as "off" (mirrors the frontend's STATES_OFF). */
const STATES_OFF = ["closed", "locked", "off"];

/**
 * Toggle an entity the way Home Assistant's built-in cards do.
 *
 * The bundled `custom-card-helpers` `toggleEntity` is outdated — it only special-cases
 * `lock`/`cover`, so toggling a `scene` (or `button`/`input_button`/`valve`) falls through
 * to `<domain>.turn_off`, which doesn't exist (e.g. "Action scene.turn_off not found").
 * This mirrors the current HA frontend `turnOnOffEntity`.
 */
export function toggleEntity(hass: HomeAssistant, entityId: string): void {
  const stateObj = hass.states[entityId];
  if (!stateObj) return;

  const turnOn = STATES_OFF.includes(stateObj.state);
  const stateDomain = computeDomain(entityId);
  const serviceDomain = stateDomain === "group" ? "homeassistant" : stateDomain;

  let service: string;
  switch (stateDomain) {
    case "lock":
      service = turnOn ? "unlock" : "lock";
      break;
    case "cover":
      service = turnOn ? "open_cover" : "close_cover";
      break;
    case "button":
    case "input_button":
      service = "press";
      break;
    case "scene":
      service = "turn_on";
      break;
    case "valve":
      service = turnOn ? "open_valve" : "close_valve";
      break;
    default:
      service = turnOn ? "turn_on" : "turn_off";
  }

  hass.callService(serviceDomain, service, { entity_id: entityId });
}

/** Mirror custom-card-helpers' confirmation gate so `toggle` confirmations still work. */
export function confirmTedAction(hass: HomeAssistant, actionConfig: ActionConfig): boolean {
  const confirmation = actionConfig.confirmation;
  if (
    confirmation &&
    (!confirmation.exemptions ||
      !confirmation.exemptions.some((e) => e.user === hass.user?.id))
  ) {
    forwardHaptic("warning");
    return window.confirm(
      confirmation.text || `Are you sure you want to ${actionConfig.action}?`,
    );
  }
  return true;
}

/** The action fields `runTedAction` / `handleAction` read off a config object. */
export interface TedActionConfig {
  entity?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export interface RunTedActionOptions {
  /** When `false`, the `navigate-dashboard` action is ignored (standalone hosts that
   *  don't opt into the Ted's Cards Backend). Other actions always run. */
  backendIntegration?: boolean;
  /** Action to run for `tap` when no explicit `tap_action` is set (Button Card only). */
  defaultAction?: string;
}

/**
 * Run the configured action for a gesture. Hold / double-tap only fire when configured;
 * `tap` falls back to `opts.defaultAction` when provided (the Button Card passes the
 * entity's default action). Handles `toggle` and `navigate-dashboard` locally, and
 * delegates everything else (navigate / url / call-service / more-info / …) to
 * `handleAction`.
 */
export function runTedAction(
  host: HTMLElement,
  hass: HomeAssistant,
  config: TedActionConfig,
  action: "tap" | "hold" | "double_tap",
  opts: RunTedActionOptions = {},
): void {
  if (action === "hold" && !hasAction(config.hold_action)) return;
  if (action === "double_tap" && !hasAction(config.double_tap_action)) return;

  const explicit =
    action === "tap"
      ? config.tap_action
      : action === "hold"
        ? config.hold_action
        : config.double_tap_action;
  const actionConfig: ActionConfig | undefined =
    explicit ??
    (action === "tap" && opts.defaultAction
      ? ({ action: opts.defaultAction } as ActionConfig)
      : undefined);
  if (!actionConfig) return;

  // `custom-card-helpers`' bundled `toggle` handler calls `<domain>.turn_off` for
  // scenes/buttons/valves/etc., which fails; handle `toggle` ourselves.
  if (actionConfig.action === "toggle" && config.entity) {
    if (!confirmTedAction(hass, actionConfig)) return;
    toggleEntity(hass, config.entity);
    forwardHaptic("success");
    return;
  }

  // Navigate to a dashboard-path setting (resolved at tap time, so it honours the
  // configured root + this device's override). Gated by `backendIntegration`.
  if ((actionConfig.action as string) === "navigate-dashboard") {
    if (opts.backendIntegration === false) return;
    if (!confirmTedAction(hass, actionConfig)) return;
    const key = (actionConfig as unknown as { dashboard?: string }).dashboard;
    const path = key ? resolveDashboardPath(key) : "";
    if (path) {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
      forwardHaptic("success");
    }
    return;
  }

  handleAction(host, hass, config as unknown as Parameters<typeof handleAction>[2], action);
}
