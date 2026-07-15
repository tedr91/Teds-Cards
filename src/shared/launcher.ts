/**
 * View Launcher: auto-discovered navbar buttons that navigate to the current
 * dashboard's views. Shared by the Navbar card (builds + renders the buttons) and
 * the Settings card (curates the available list + per-button options).
 *
 * Views are read live from the dashboard's Lovelace config; nothing about the views
 * themselves is stored. The stored settings are only: which views are offered
 * (`launcher_list`), per-view button options (`launcher_options`), and the group-level
 * flags (`launcher_enabled` / `launcher_section` / `launcher_combine_groups` /
 * `launcher_highlight_active` / `launcher_active_color`).
 */
import { BUTTON_CARD_TYPE, DEFAULT_BUTTON_ICON } from "../cards/button-card/const";
import type { ButtonCardConfig } from "../cards/button-card/types";
import { EXPANDABLE_BUTTON_CARD_TYPE } from "../cards/expandable-button-card/const";
import type { NavButtonConfig, NavButtonSize } from "../cards/navbar-card/types";
import { cssColor, MAX_BLUR_PX } from "./appearance";

/** A dashboard view discovered from the Lovelace config. */
export interface LauncherViewInfo {
  /** The view's navigable path (its `path`, else its index as a string). */
  path: string;
  /** The view's title (falls back to the path). */
  title: string;
  /** The view's icon, if any (mdi:*). */
  icon?: string;
  /** Whether the view is a subview (excluded from the launcher by default). */
  subview: boolean;
  /** The view's index in the dashboard. */
  index: number;
}

/**
 * Per-view launcher button options, keyed by view path in `launcher_options`. A subset
 * of the Button Card config (name / icon / badge / highlight / appearance) plus the
 * nav-only button size. Spread over the generated button so every edited key applies.
 */
export type LauncherButtonOptions = Partial<ButtonCardConfig> & {
  nav_button_size?: NavButtonSize;
};

export type LauncherOptionsMap = Record<string, LauncherButtonOptions>;

/** The five fixed navbar sections a launcher can target, in index order. */
export const LAUNCHER_SECTIONS = [
  { value: "left", label: "Left" },
  { value: "mid-left", label: "Mid-Left" },
  { value: "center", label: "Center" },
  { value: "mid-right", label: "Mid-Right" },
  { value: "right", label: "Right" },
] as const;

/** Map a `launcher_section` value to its fixed navbar section index (0-4). */
export function launcherSectionIndex(section: string | undefined): number {
  const i = LAUNCHER_SECTIONS.findIndex((s) => s.value === section);
  return i >= 0 ? i : 2;
}

/** Find HA's `ha-panel-lovelace` element (host of the current dashboard), or null. */
function findLovelacePanel(): (HTMLElement & { lovelace?: LovelaceLike; panel?: PanelLike }) | null {
  return (
    (document
      .querySelector("home-assistant")
      ?.shadowRoot?.querySelector("home-assistant-main")
      ?.shadowRoot?.querySelector("ha-panel-lovelace") as
      | (HTMLElement & { lovelace?: LovelaceLike; panel?: PanelLike })
      | null) ?? null
  );
}

interface LovelaceViewConfigLike {
  path?: string;
  title?: string;
  icon?: string;
  subview?: boolean;
}
interface LovelaceLike {
  config?: { views?: LovelaceViewConfigLike[] };
  urlPath?: string | null;
}
interface PanelLike {
  url_path?: string;
}

/** The dashboard slug the current view lives under (e.g. `ted-dashboard`). */
export function readDashboardUrlPath(): string {
  const panel = findLovelacePanel();
  const fromLovelace = panel?.lovelace?.urlPath;
  if (typeof fromLovelace === "string" && fromLovelace) return fromLovelace;
  const fromPanel = panel?.panel?.url_path;
  if (typeof fromPanel === "string" && fromPanel) return fromPanel;
  // Fallback: the first path segment of the URL.
  return window.location.pathname.split("/").filter(Boolean)[0] ?? "";
}

/** Read the current dashboard's views from the Lovelace config (empty when unavailable). */
export function readLovelaceViews(): LauncherViewInfo[] {
  const views = findLovelacePanel()?.lovelace?.config?.views;
  if (!Array.isArray(views)) return [];
  return views.map((v, index) => ({
    path: typeof v.path === "string" && v.path ? v.path : String(index),
    title: v.title || (typeof v.path === "string" ? v.path : String(index)),
    icon: typeof v.icon === "string" ? v.icon : undefined,
    subview: v.subview === true,
    index,
  }));
}

/** The path segment identifying the currently-open view (or undefined at the root). */
export function readCurrentViewPath(): string | undefined {
  const dash = readDashboardUrlPath();
  const segments = window.location.pathname.split("/").filter(Boolean);
  // /<dashboard>/<view> → the segment after the dashboard slug.
  const dashIdx = segments.indexOf(dash);
  if (dashIdx >= 0 && segments.length > dashIdx + 1) return decodeURIComponent(segments[dashIdx + 1]);
  return segments.length >= 2 ? decodeURIComponent(segments[segments.length - 1]) : undefined;
}

/** The client-side navigation path for a view. */
export function launcherViewNavPath(dashboardUrlPath: string, view: LauncherViewInfo): string {
  return `/${dashboardUrlPath}/${view.path}`;
}

/** A view's grouping identifier (lowercased path, else title). */
function viewIdentifier(view: LauncherViewInfo): string {
  return (view.path || view.title || String(view.index)).toLowerCase();
}

/** The prefix a view groups under: its identifier up to the first `-` or space. */
export function launcherPrefix(view: LauncherViewInfo): string {
  return viewIdentifier(view).split(/[-\s]/)[0];
}

/** A launcher group: one or more views sharing a prefix, with a designated primary. */
export interface LauncherGroup {
  prefix: string;
  primary: LauncherViewInfo;
  members: LauncherViewInfo[];
  /** True when the group holds more than one view (renders as an expandable button). */
  isGroup: boolean;
}

/**
 * Group the ordered views by prefix. When `combine` is false, every view is its own
 * singleton group. The primary is (in order): a member exposed as a dashboard-path
 * setting (`primaryPaths`), else the view whose identifier equals the prefix (no suffix
 * — e.g. `home` in {home, home-nightstand}), else the first view in the group.
 */
export function groupLauncherViews(
  views: LauncherViewInfo[],
  combine: boolean,
  primaryPaths?: Set<string>,
): LauncherGroup[] {
  const pickPrimary = (members: LauncherViewInfo[], prefix: string): LauncherViewInfo => {
    if (primaryPaths) {
      const dash = members.find((m) => primaryPaths.has(m.path));
      if (dash) return dash;
    }
    return members.find((m) => viewIdentifier(m) === prefix) ?? members[0];
  };
  if (!combine) {
    return views.map((v) => ({ prefix: launcherPrefix(v), primary: v, members: [v], isGroup: false }));
  }
  const consumed = new Set<number>();
  const groups: LauncherGroup[] = [];
  views.forEach((view, i) => {
    if (consumed.has(i)) return;
    const prefix = launcherPrefix(view);
    const members: LauncherViewInfo[] = [];
    views.forEach((w, j) => {
      if (!consumed.has(j) && launcherPrefix(w) === prefix) {
        consumed.add(j);
        members.push(w);
      }
    });
    groups.push({ prefix, primary: pickPrimary(members, prefix), members, isGroup: members.length > 1 });
  });
  return groups;
}

/** Resolve an ordered list of view paths to their discovered view info (skips unknown paths). */
export function resolveLauncherViews(paths: string[], discovered: LauncherViewInfo[]): LauncherViewInfo[] {
  const byPath = new Map(discovered.map((v) => [v.path, v]));
  const out: LauncherViewInfo[] = [];
  for (const p of paths) {
    const v = byPath.get(p);
    if (v) out.push(v);
  }
  return out;
}

/**
 * Map each view path to the dashboard-path setting key (e.g. `cameras_dashboard`) that
 * targets it, from the effective settings. Lets the launcher navigate the exposed views
 * via the root-portable `navigate-dashboard` action (and use them as the group primary).
 * Keys are settings ending in `_dashboard` (except `dashboard_root`); their `[root]/<view>`
 * value resolves to the first path segment after the dashboard slug (query stripped).
 */
export function dashboardKeyByViewPath(effective: Record<string, unknown>): Record<string, string> {
  const root = String(effective.dashboard_root ?? "ted-dashboard");
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(effective)) {
    if (key === "dashboard_root" || !key.endsWith("_dashboard")) continue;
    if (typeof val !== "string" || !val) continue;
    const path = val.replace("[root]", root).replace(/^\//, "");
    const segs = path.split("/");
    if (segs[0] !== root || segs.length < 2) continue;
    const view = decodeURIComponent(segs[1].split(/[?#]/)[0]);
    if (view && !(view in out)) out[view] = key;
  }
  return out;
}

/**
 * The effective ordered available view paths: the curated `launcher_list` when set,
 * else all discovered non-subview views (zero-config behaviour).
 */
export function effectiveLauncherPaths(list: string[], discovered: LauncherViewInfo[]): string[] {
  if (list.length) return list;
  return discovered.filter((v) => !v.subview).map((v) => v.path);
}

/** Base styling for every launcher button: a tinted surface + matching icon in the
 *  configured button color (defaults to white), at 25% opacity, following the navbar theme. */
function launcherButtonBase(color: string, theme: string): Partial<NavButtonConfig> {
  return {
    icon_scale: 140,
    icon_color: color,
    theme: theme === "ted-style" ? "ted-style" : "ha",
    background: color,
    transparency: 75,
    show_name: false,
    show_state: false,
  };
}

interface BuildLauncherParams {
  /** Ordered, resolved available views (already filtered to the curated list). */
  views: LauncherViewInfo[];
  options: LauncherOptionsMap;
  combine: boolean;
  /** The dashboard slug used to build plain `navigate` paths (the configured root). */
  dashboardUrlPath: string;
  /** View path → dashboard-path setting key, for root-portable `navigate-dashboard`. */
  dashboardKeyByPath: Record<string, string>;
  currentViewPath?: string;
  highlightActive: boolean;
  /** Tint/icon color of every launcher button (default white). */
  buttonColor?: string;
  /** Ring color marking the current view's button (default accent). */
  highlightColor?: string;
  /** The navbar's own surface appearance, mirrored onto a combined group's popup so it
   *  visually matches the bar. */
  navBackground?: string;
  navTransparency?: number;
  navBlur?: number;
  /** The navbar's theme (`ha` | `ted-style`), so launcher buttons + the group popup match. */
  navTheme?: string;
  /** The navbar's button size (px), so a group popup's buttons match the bar. */
  navButtonSize?: number;
  /** Quick-launch groups: a group's trigger single-tap navigates to its dashboard and
   *  hold opens the popout (instead of a tap opening the popout). */
  quickLaunch?: boolean;
}

/** Capitalize the first letter (e.g. a group prefix `home` → `Home`). */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Inline surface style for a combined group's popup, matching the navbar bar's
 *  background / transparency / blur so the popup reads as a piece of the navbar. */
function launcherPopupStyle(background?: string, transparency?: number, blur?: number): Record<string, string> {
  const style: Record<string, string> = {};
  const bg =
    cssColor(background) ||
    "var(--ted-style-surface, var(--ha-card-background, var(--card-background-color, #ffffff)))";
  const t = typeof transparency === "number" ? Math.min(100, Math.max(0, transparency)) : undefined;
  if (t != null && t > 0) style.background = `color-mix(in srgb, ${bg} ${100 - t}%, transparent)`;
  else if (background) style.background = bg;
  const b = typeof blur === "number" ? Math.min(100, Math.max(0, blur)) : undefined;
  if (b != null && b > 0) {
    const px = (b / 100) * MAX_BLUR_PX;
    style["backdrop-filter"] = `blur(${px}px)`;
    style["-webkit-backdrop-filter"] = `blur(${px}px)`;
  }
  return style;
}

/** Build a plain launcher button (a Button Card) that navigates to a view: via the
 *  root-portable `navigate-dashboard` action when the view is exposed as a dashboard-path
 *  setting, else a plain `navigate` to its path. */
function viewTapAction(view: LauncherViewInfo, p: BuildLauncherParams): NavButtonConfig["tap_action"] {
  const dashKey = p.dashboardKeyByPath[view.path];
  return (dashKey
    ? { action: "navigate-dashboard", dashboard: dashKey }
    : { action: "navigate", navigation_path: launcherViewNavPath(p.dashboardUrlPath, view) }) as unknown as NavButtonConfig["tap_action"];
}

function plainButton(view: LauncherViewInfo, p: BuildLauncherParams, showName: boolean): NavButtonConfig {
  const opt = p.options[view.path] ?? {};
  const active = p.highlightActive && view.path === p.currentViewPath;
  const color = p.buttonColor || "white";
  const iconOpt = typeof opt.icon === "string" ? opt.icon : undefined;
  const tap_action = viewTapAction(view, p);
  const btn: NavButtonConfig = {
    ...launcherButtonBase(color, p.navTheme || "ha"),
    ...opt,
    type: `custom:${BUTTON_CARD_TYPE}`,
    icon: iconOpt || view.icon || DEFAULT_BUTTON_ICON,
    name: opt.name || view.title,
    tap_action,
  };
  if (showName) btn.show_name = opt.show_name ?? true;
  if (active) {
    // The current-view button: a highlight ring + a slightly more solid (40%) tint.
    btn.ring = p.highlightColor || "accent";
    btn.transparency = 60;
  }
  return btn;
}

/**
 * Build the launcher's navbar buttons for the given views: a plain button per
 * ungrouped view, and an Expandable Button Card per multi-view group (its trigger
 * seeded from the primary view's icon/name, its popup listing every member view).
 */
export function buildLauncherButtons(p: BuildLauncherParams): NavButtonConfig[] {
  const primaryPaths = new Set(Object.keys(p.dashboardKeyByPath));
  const groups = groupLauncherViews(p.views, p.combine, primaryPaths);
  const color = p.buttonColor || "white";
  const popupStyle = launcherPopupStyle(p.navBackground, p.navTransparency, p.navBlur);
  return groups.map((group) => {
    if (!group.isGroup) return plainButton(group.primary, p, false);
    const primaryOpt = p.options[group.primary.path] ?? {};
    const primaryIcon = typeof primaryOpt.icon === "string" ? primaryOpt.icon : undefined;
    // The group's label is the shared prefix (e.g. "Home"), unless the primary button
    // has an explicit name override.
    const label = primaryOpt.name || capitalize(group.prefix);
    const groupActive =
      p.highlightActive && group.members.some((m) => m.path === p.currentViewPath);
    const trigger: NavButtonConfig = {
      ...launcherButtonBase(color, p.navTheme || "ha"),
      ...primaryOpt,
      type: `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`,
      icon: primaryIcon || group.primary.icon || DEFAULT_BUTTON_ICON,
      name: label,
      flip_icon: false,
      popup_title: label,
      group_indicator: true,
      ...(Object.keys(popupStyle).length ? { popup_style: popupStyle } : {}),
      ...(p.navButtonSize ? { popup_item_size: p.navButtonSize } : {}),
      items: group.members.map((m) => plainButton(m, p, false)),
      tap_action: undefined,
    } as NavButtonConfig;
    // Quick-launch: the group's trigger single-taps to its primary/dashboard and a hold
    // opens the popout. Otherwise a tap opens the popout (trigger has no tap action).
    if (p.quickLaunch) {
      (trigger as unknown as { quick_launch?: boolean }).quick_launch = true;
      trigger.tap_action = viewTapAction(group.primary, p);
    }
    if (groupActive) {
      trigger.ring = p.highlightColor || "accent";
      trigger.transparency = 60;
    }
    return trigger;
  });
}

/** Read a `launcher_options` value into a typed map (defensive against bad shapes). */
export function launcherOptionsMap(value: unknown): LauncherOptionsMap {
  const out: LauncherOptionsMap = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [path, opt] of Object.entries(value as Record<string, unknown>)) {
      if (opt && typeof opt === "object" && !Array.isArray(opt)) {
        out[path] = { ...(opt as LauncherButtonOptions) };
      }
    }
  }
  return out;
}
