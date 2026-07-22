/**
 * Shared "collapsing tab strip" logic used by every card that renders a horizontal
 * tab/section strip (Tab card, Settings card section tabs, Music card tabs).
 *
 * Two pure-ish helpers factor out the behaviour that was previously duplicated:
 *   - `computeTabOverflow` decides the effective header mode + how many tabs fit,
 *     the rest spilling into a "…" overflow menu.
 *   - `positionOverflowPopover` anchors a native popover under the "…" trigger,
 *     flipping above / clamping to the viewport when there's no room.
 *
 * Cards keep their own markup + CSS (badges, icons, child panels differ); they just
 * feed measured widths in and get the {mode, visibleCount} decision out. Reading the
 * widths from a hidden measure mirror (rendered at both the configured mode and
 * icon-only) keeps the result stable — no render→measure→render feedback loop.
 */

export type TabHeaderMode = "both" | "icon" | "name";

export interface TabOverflowInput<M extends string = TabHeaderMode> {
  /** Natural widths of each tab at the configured header mode. */
  fullWidths: number[];
  /** Natural widths of each tab at icon-only (used by auto-shrink). */
  iconWidths: number[];
  /** Available width of the live strip (its clientWidth). */
  available: number;
  /** The configured header mode. */
  configMode: M;
  /** The mode value that represents icon-only (usually "icon"). */
  iconMode: M;
  /** When true, shrink to icon-only before spilling tabs into the overflow menu. */
  autoShrink: boolean;
  /** Gap between tabs in px (default 4). */
  gap?: number;
  /** Width reserved for the "…" trigger + gap when tabs spill (default 52). */
  overflowReserve?: number;
}

export interface TabOverflowResult<M extends string = TabHeaderMode> {
  mode: M;
  visibleCount: number;
}

/**
 * Decide the effective header mode + how many tabs fit; the rest move into the "…"
 * overflow menu. Mirrors the algorithm previously inlined in the Tab and Settings cards.
 */
export function computeTabOverflow<M extends string = TabHeaderMode>(
  input: TabOverflowInput<M>,
): TabOverflowResult<M> {
  const gap = input.gap ?? 4;
  const overflowBtn = input.overflowReserve ?? 52;
  const total = input.fullWidths.length;
  const sum = (arr: number[]): number =>
    arr.reduce((a, b) => a + b, 0) + Math.max(0, arr.length - 1) * gap;

  let mode: M;
  let visibleCount: number;
  if (sum(input.fullWidths) <= input.available) {
    mode = input.configMode;
    visibleCount = total;
  } else if (input.autoShrink && sum(input.iconWidths) <= input.available) {
    // Auto-shrink forces icon-only (even for a "name" header) when that lets them all fit.
    mode = input.iconMode;
    visibleCount = total;
  } else {
    mode = input.autoShrink ? input.iconMode : input.configMode;
    const widths = mode === input.iconMode ? input.iconWidths : input.fullWidths;
    const budget = input.available - overflowBtn;
    let used = 0;
    let count = 0;
    for (let i = 0; i < total; i++) {
      const add = (count > 0 ? gap : 0) + widths[i];
      if (used + add > budget) break;
      used += add;
      count++;
    }
    visibleCount = Math.max(1, count);
  }
  return { mode, visibleCount };
}

/** Anchor an open overflow popover under its "…" trigger (flipping above / clamping to
 *  the viewport when there's no room). Centres it if no anchor is given. */
export function positionOverflowPopover(
  pop: HTMLElement,
  anchor?: HTMLElement,
  margin = 8,
): void {
  pop.style.position = "fixed";
  pop.style.margin = "0";
  const rect = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  if (!anchor) {
    pop.style.left = `${Math.round((vw - rect.width) / 2)}px`;
    pop.style.top = `${Math.round((vh - rect.height) / 2)}px`;
    return;
  }
  const a = anchor.getBoundingClientRect();
  let left = a.right - rect.width;
  left = Math.max(margin, Math.min(left, vw - rect.width - margin));
  const fitsBelow = a.bottom + margin + rect.height <= vh - margin;
  let top = fitsBelow ? a.bottom + margin : a.top - margin - rect.height;
  top = Math.max(margin, Math.min(top, vh - rect.height - margin));
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}
