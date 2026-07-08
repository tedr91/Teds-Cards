import type { HomeAssistant } from "custom-card-helpers";

/**
 * Visibility conditions for nav items. A superset of Home Assistant's card
 * `visibility:` conditions (so familiar syntax works) plus a `view-assist`
 * condition that resolves the *current device* from the `view_assist_sensor`
 * localStorage key — something HA's static, entity-based conditions can't do.
 *
 * Top-level conditions are AND-ed (every one must pass), matching HA.
 */
export type Condition =
  | StateCondition
  | NumericStateCondition
  | ScreenCondition
  | UserCondition
  | ViewAssistCondition
  | CardCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | LegacyCondition;

export interface StateCondition {
  condition: "state";
  entity?: string;
  attribute?: string;
  state?: string | string[];
  state_not?: string | string[];
}

export interface NumericStateCondition {
  condition: "numeric_state";
  entity?: string;
  attribute?: string;
  above?: number;
  below?: number;
}

export interface ScreenCondition {
  condition: "screen";
  media_query?: string;
}

export interface UserCondition {
  condition: "user";
  users?: string[];
}

/** Condition evaluated against the current View Assist device + dashboard view. */
export interface ViewAssistCondition {
  condition: "view-assist";
  /** true → on a VA device (a `view_assist_sensor` exists); false → not. */
  present?: boolean;
  /** Match the device's VA sensor `mode` attribute (e.g. "hold"). */
  mode?: string | string[];
  mode_not?: string | string[];
  /** Match the current dashboard view slug (last path segment), e.g. "clock". */
  view?: string | string[];
  not_view?: string | string[];
}

/** Condition evaluated against the registered custom cards (`window.customCards`). */
export interface CardCondition {
  condition: "card";
  /** Pass only when every listed custom card type is registered. */
  registered?: string | string[];
  /** Pass when any listed custom card type is NOT registered. */
  not_registered?: string | string[];
}

export interface AndCondition {
  condition: "and";
  conditions?: Condition[];
}
export interface OrCondition {
  condition: "or";
  conditions?: Condition[];
}
export interface NotCondition {
  condition: "not";
  conditions?: Condition[];
}

/** Legacy conditional-card shorthand: `{ entity, state | state_not }`. */
export interface LegacyCondition {
  condition?: undefined;
  entity?: string;
  state?: string | string[];
  state_not?: string | string[];
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** This browser's View Assist sensor entity id, or null when not a VA device. */
function vaSensor(): string | null {
  try {
    return localStorage.getItem("view_assist_sensor");
  } catch {
    return null;
  }
}

/** The current dashboard view slug — the last non-empty segment of the path. */
function currentViewSlug(): string {
  try {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  } catch {
    return "";
  }
}

function checkState(c: StateCondition | LegacyCondition, hass?: HomeAssistant): boolean {
  if (!c.entity || !hass) return false;
  const stateObj = hass.states[c.entity];
  const value =
    "attribute" in c && c.attribute
      ? stateObj?.attributes[c.attribute]
      : stateObj?.state;
  const current = value == null ? "unknown" : String(value);
  if (c.state != null) return asArray(c.state).map(String).includes(current);
  if (c.state_not != null) return !asArray(c.state_not).map(String).includes(current);
  return false;
}

function checkNumericState(c: NumericStateCondition, hass?: HomeAssistant): boolean {
  if (!c.entity || !hass) return false;
  const stateObj = hass.states[c.entity];
  const raw = c.attribute ? stateObj?.attributes[c.attribute] : stateObj?.state;
  const n = Number(raw);
  if (Number.isNaN(n)) return false;
  return (c.above == null || n > c.above) && (c.below == null || n < c.below);
}

function checkScreen(c: ScreenCondition): boolean {
  try {
    return c.media_query ? window.matchMedia(c.media_query).matches : false;
  } catch {
    return false;
  }
}

function checkUser(c: UserCondition, hass?: HomeAssistant): boolean {
  return !!(c.users && hass?.user?.id && c.users.includes(hass.user.id));
}

function checkViewAssist(c: ViewAssistCondition, hass?: HomeAssistant): boolean {
  const sensor = vaSensor();
  if (c.present !== undefined && c.present !== !!sensor) return false;
  if (c.mode != null || c.mode_not != null) {
    const mode = sensor && hass ? String(hass.states[sensor]?.attributes.mode ?? "") : "";
    if (c.mode != null && !asArray(c.mode).includes(mode)) return false;
    if (c.mode_not != null && asArray(c.mode_not).includes(mode)) return false;
  }
  if (c.view != null || c.not_view != null) {
    const view = currentViewSlug();
    if (c.view != null && !asArray(c.view).includes(view)) return false;
    if (c.not_view != null && asArray(c.not_view).includes(view)) return false;
  }
  return true;
}

function checkCard(c: CardCondition): boolean {
  const have = new Set(
    (window.customCards || []).map((e) => (e.type || "").replace(/^custom:/, "")),
  );
  if (c.registered != null) {
    if (!asArray(c.registered).every((t) => have.has(String(t).replace(/^custom:/, "")))) {
      return false;
    }
  }
  if (c.not_registered != null) {
    if (!asArray(c.not_registered).some((t) => !have.has(String(t).replace(/^custom:/, "")))) {
      return false;
    }
  }
  return true;
}

function checkOne(c: Condition, hass?: HomeAssistant): boolean {
  switch (c.condition) {
    case "state":
      return checkState(c, hass);
    case "numeric_state":
      return checkNumericState(c, hass);
    case "screen":
      return checkScreen(c);
    case "user":
      return checkUser(c, hass);
    case "view-assist":
      return checkViewAssist(c, hass);
    case "card":
      return checkCard(c);
    case "and":
      return (c.conditions ?? []).every((x) => checkOne(x, hass));
    case "or":
      return (c.conditions ?? []).some((x) => checkOne(x, hass));
    case "not":
      return !(c.conditions ?? []).every((x) => checkOne(x, hass));
    default:
      // Legacy `{ entity, state/state_not }`.
      return checkState(c as LegacyCondition, hass);
  }
}

/** True when all conditions pass (AND). Empty/undefined → true. */
export function checkConditions(conditions: Condition[] | undefined, hass?: HomeAssistant): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => checkOne(c, hass));
}

/**
 * Combined visibility test used by hosts (navbar items, etc.):
 * hidden when `visible === false`, otherwise governed by `conditions`.
 */
export function isVisible(
  visible: boolean | undefined,
  conditions: Condition[] | undefined,
  hass?: HomeAssistant,
): boolean {
  if (visible === false) return false;
  return checkConditions(conditions, hass);
}

/** Condition kinds whose result can change without a `hass` update — hosts should
 *  also re-evaluate on these DOM events (resize → screen; navigation → view). */
export const VISIBILITY_DOM_EVENTS = ["resize", "location-changed", "popstate"] as const;
