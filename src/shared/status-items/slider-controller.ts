/**
 * Reactive controller holding the stateful brightness/volume slider-popover
 * behavior shared by the Room Card and Navbar Card: live drag preview, the
 * native popover positioning, the volume double-tap-to-mute timing, and the
 * service calls. Each host instantiates one and wires its renderers through it.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant } from "custom-card-helpers";

import { VOLUME_DOUBLE_TAP_MS } from "./const";
import type { StatusItem } from "./types";

interface SliderHost extends ReactiveControllerHost {
  readonly renderRoot: HTMLElement | DocumentFragment;
  hass?: HomeAssistant;
}

/** A notification opened in the centered detail modal. */
export interface NotifDetail {
  id: string;
  title?: string;
  message: string;
  severity?: string;
  icon?: string;
  created?: string;
}

/** Reopen guard: ignore a volume re-open within this long after a close. */
const VOLUME_REOPEN_GUARD_MS = 350;

/** How long a pointer must be held to open a count item's options menu. */
const LONG_PRESS_MS = 500;

/** How long to wait for a second click before treating a click as a single tap. */
const DOUBLE_CLICK_MS = 250;

/** Effective per-gesture callbacks for an item that runs button-like interactions. */
export interface Gestures {
  tap?: () => void;
  hold?: () => void;
  doubleTap?: () => void;
}

/** True when any gesture callback is present (so the item should look clickable). */
export function gesturesActive(g?: Gestures): boolean {
  return !!(g && (g.tap || g.hold || g.doubleTap));
}

function sliderValue(ev: Event): number {
  return Number.parseFloat((ev.target as HTMLInputElement).value);
}

export class StatusSliderController implements ReactiveController {
  private readonly host: SliderHost;
  /** Live drag value, while the user drags a slider (keyed per item). */
  active?: { key: string; value: number };
  /** The notification currently shown in the centered detail modal (if any). */
  notifDetail?: NotifDetail;
  private volumeClickTimer?: number;
  private volumeClosedAt = 0;
  /** Long-press timer + "fired" flag for hold-to-open-options on count items. */
  private holdTimer?: number;
  private holdFired = false;
  /** Generic gesture (tap/hold/double-tap) timers + flag for action-enabled items. */
  private gestureHoldTimer?: number;
  private gestureClickTimer?: number;
  private gestureHoldFired = false;
  /** Removes the outside-tap / Escape listeners for an open manual (hold) popover. */
  private manualDismiss?: () => void;

  constructor(host: SliderHost) {
    this.host = host;
    host.addController(this);
  }

  hostDisconnected(): void {
    if (this.volumeClickTimer !== undefined) {
      window.clearTimeout(this.volumeClickTimer);
      this.volumeClickTimer = undefined;
    }
    if (this.holdTimer !== undefined) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    }
    if (this.gestureHoldTimer !== undefined) {
      window.clearTimeout(this.gestureHoldTimer);
      this.gestureHoldTimer = undefined;
    }
    if (this.gestureClickTimer !== undefined) {
      window.clearTimeout(this.gestureClickTimer);
      this.gestureClickTimer = undefined;
    }
    this.teardownManualDismiss();
  }

  /** Current value for a slider key — the live drag value if dragging, else the model value. */
  value(key: string, fallback: number): number {
    return this.active?.key === key ? this.active.value : fallback;
  }

  onInput(ev: Event, key: string): void {
    const value = sliderValue(ev);
    if (!Number.isFinite(value)) return;
    this.active = { key, value };
    this.host.requestUpdate();
  }

  onChange(ev: Event, item: StatusItem): void {
    const value = sliderValue(ev);
    this.active = undefined;
    this.host.requestUpdate();
    if (!Number.isFinite(value)) return;
    const hass = this.host.hass;
    if (!hass) return;
    if (item.type === "brightness") {
      const domain = item.entity.split(".")[0];
      if (domain === "light") {
        if (value <= 0) {
          hass.callService("light", "turn_off", { entity_id: item.entity });
        } else {
          hass.callService("light", "turn_on", { entity_id: item.entity, brightness_pct: Math.round(value) });
        }
      } else {
        hass.callService(domain, "set_value", { entity_id: item.entity, value });
      }
    } else if (item.type === "volume") {
      hass.callService("media_player", "volume_set", {
        entity_id: item.entity,
        volume_level: Math.max(0, Math.min(1, value / 100)),
      });
    }
  }

  /** Volume button click: single tap opens the slider, double tap toggles mute. */
  onVolumeClick(entityId: string, popId: string): void {
    if (this.volumeClickTimer !== undefined) {
      window.clearTimeout(this.volumeClickTimer);
      this.volumeClickTimer = undefined;
      this.toggleMute(entityId);
      return;
    }
    this.volumeClickTimer = window.setTimeout(() => {
      this.volumeClickTimer = undefined;
      this.openPopover(popId);
    }, VOLUME_DOUBLE_TAP_MS);
  }

  private toggleMute(entityId: string): void {
    const hass = this.host.hass;
    const muted = hass?.states[entityId]?.attributes?.is_volume_muted === true;
    hass?.callService("media_player", "volume_mute", { entity_id: entityId, is_volume_muted: !muted });
  }

  /** Public mute toggle (used as a volume item's built-in double-tap when a custom
   *  action is configured elsewhere on the item). */
  muteVolume(entityId: string): void {
    this.toggleMute(entityId);
  }

  /** Pointer down for a generic gesture item: arm the long-press if a hold is bound. */
  onGestureDown(g?: Gestures): void {
    this.gestureHoldFired = false;
    if (!g?.hold) return;
    if (this.gestureHoldTimer !== undefined) window.clearTimeout(this.gestureHoldTimer);
    this.gestureHoldTimer = window.setTimeout(() => {
      this.gestureHoldTimer = undefined;
      this.gestureHoldFired = true;
      g.hold?.();
    }, LONG_PRESS_MS);
  }

  /** Pointer up / cancel / leave for a generic gesture item: disarm the long-press. */
  onGestureUp(): void {
    if (this.gestureHoldTimer !== undefined) {
      window.clearTimeout(this.gestureHoldTimer);
      this.gestureHoldTimer = undefined;
    }
  }

  /** Click for a generic gesture item: dispatch tap (deferred only when a double-tap
   *  is bound), or double-tap on the second click. Suppressed if a hold already fired. */
  onGestureClick(g?: Gestures): void {
    if (!g) return;
    if (this.gestureHoldFired) {
      this.gestureHoldFired = false;
      return;
    }
    if (this.gestureClickTimer !== undefined) {
      window.clearTimeout(this.gestureClickTimer);
      this.gestureClickTimer = undefined;
      if (g.doubleTap) g.doubleTap();
      else g.tap?.();
      return;
    }
    if (!g.doubleTap) {
      g.tap?.();
      return;
    }
    this.gestureClickTimer = window.setTimeout(() => {
      this.gestureClickTimer = undefined;
      g.tap?.();
    }, DOUBLE_CLICK_MS);
  }

  /** Open a popover by id (guarded against a volume re-open flicker). */
  openPopover(popId: string): void {
    const root = this.host.renderRoot as ShadowRoot;
    const popover = root.getElementById?.(popId) as (HTMLElement & { showPopover?: () => void }) | null;
    if (!popover || popover.matches(":popover-open")) return;
    if (Date.now() - this.volumeClosedAt < VOLUME_REOPEN_GUARD_MS) return;
    popover.showPopover?.();
  }

  /** Begin a long-press: after LONG_PRESS_MS, open `popId` (hold-to-open menu). */
  startHold(popId: string): void {
    this.holdFired = false;
    if (this.holdTimer !== undefined) window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = undefined;
      this.holdFired = true;
      this.openManualPopover(popId);
    }, LONG_PRESS_MS);
  }

  /** Open a hold-to-open menu that manages its own dismissal. A native `auto` popover
   *  would be light-dismissed by the release of the very long-press that opened it
   *  (unless the finger moved first); a `manual` popover plus our own outside-tap /
   *  Escape handling avoids that. The listeners are attached now — while the opening
   *  gesture's pointer is still DOWN — so its release (a pointerup) can't trigger them. */
  openManualPopover(popId: string): void {
    const root = this.host.renderRoot as ShadowRoot;
    const popover = root.getElementById?.(popId) as
      | (HTMLElement & { showPopover?: () => void })
      | null;
    if (!popover || popover.matches(":popover-open")) return;
    popover.showPopover?.();
    this.teardownManualDismiss();
    const onDown = (ev: Event): void => {
      if (!ev.composedPath().includes(popover)) this.closePopover(popId);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") this.closePopover(popId);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    this.manualDismiss = () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }

  private teardownManualDismiss(): void {
    this.manualDismiss?.();
    this.manualDismiss = undefined;
  }

  /** Cancel a pending long-press without firing (e.g. pointer left the target). */
  cancelHold(): void {
    if (this.holdTimer !== undefined) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = undefined;
    }
  }

  /** On click: returns true if a hold already fired (so the tap should be suppressed). */
  consumeHold(): boolean {
    this.cancelHold();
    const fired = this.holdFired;
    this.holdFired = false;
    return fired;
  }

  /** Close a popover by id (used by the options menu buttons). */
  closePopover(popId: string): void {
    const pop = (this.host.renderRoot as ShadowRoot).getElementById?.(popId) as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    pop?.hidePopover?.();
  }

  /** Open a notification in the centered detail modal (rendered after state updates). */
  openNotifDetail(row: NotifDetail, detailPopId: string): void {
    this.notifDetail = row;
    this.host.requestUpdate();
    void this.host.updateComplete.then(() => {
      const pop = (this.host.renderRoot as ShadowRoot).getElementById?.(detailPopId) as
        | (HTMLElement & { showPopover?: () => void; matches?: (s: string) => boolean })
        | null;
      if (pop && !pop.matches?.(":popover-open")) pop.showPopover?.();
    });
  }

  /** Close the detail modal (its `toggle` handler clears `notifDetail`). */
  closeNotifDetail(detailPopId: string): void {
    const pop = (this.host.renderRoot as ShadowRoot).getElementById?.(detailPopId) as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    pop?.hidePopover?.();
  }

  /** Clear the detail state when the modal is dismissed (backdrop / Esc / close). */
  onNotifDetailToggle = (ev: Event): void => {
    const newState = (ev as Event & { newState?: string }).newState;
    if (newState === "closed" && this.notifDetail) {
      this.notifDetail = undefined;
      this.host.requestUpdate();
    }
  };

  onPopoverToggle = (ev: Event): void => {
    const popover = ev.currentTarget as HTMLElement;
    const newState = (ev as Event & { newState?: string }).newState;
    if (newState === "open") {
      const anchorId = popover.dataset.anchor;
      const anchor = anchorId ? (this.host.renderRoot as ShadowRoot).getElementById(anchorId) : null;
      this.position(popover, anchor ?? undefined);
      return;
    }
    if (popover.id.includes("-vol-")) {
      this.volumeClosedAt = Date.now();
    }
    this.teardownManualDismiss();
    if (this.active) {
      this.active = undefined;
      this.host.requestUpdate();
    }
  };

  /** Pin a popover to the bottom-right of its anchor, flipping above when needed. */
  private position(popover: HTMLElement, anchor?: HTMLElement): void {
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.margin = "0";
    if (!anchor) {
      popover.style.left = `${Math.round((window.innerWidth - rect.width) / 2)}px`;
      popover.style.top = `${Math.round((window.innerHeight - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    let left = a.right - rect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    let top = a.bottom + margin;
    if (top + rect.height > window.innerHeight - margin && a.top - margin - rect.height >= margin) {
      top = a.top - margin - rect.height;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }
}
