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
  created?: string;
}

/** Reopen guard: ignore a volume re-open within this long after a close. */
const VOLUME_REOPEN_GUARD_MS = 350;

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

  constructor(host: SliderHost) {
    this.host = host;
    host.addController(this);
  }

  hostDisconnected(): void {
    if (this.volumeClickTimer !== undefined) {
      window.clearTimeout(this.volumeClickTimer);
      this.volumeClickTimer = undefined;
    }
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

  private openPopover(popId: string): void {
    const root = this.host.renderRoot as ShadowRoot;
    const popover = root.getElementById?.(popId) as (HTMLElement & { showPopover?: () => void }) | null;
    if (!popover || popover.matches(":popover-open")) return;
    if (Date.now() - this.volumeClosedAt < VOLUME_REOPEN_GUARD_MS) return;
    popover.showPopover?.();
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
