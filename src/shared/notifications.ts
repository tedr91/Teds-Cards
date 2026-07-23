import type { ReactiveController, ReactiveControllerHost } from "lit";

import { showMessageBox, dismissMessageBox, type MessagePopupSeverity, type ToastAction } from "./messagebox-popup";
import { settingsStore, effectiveSnooze } from "./settings";
import { resolveDeviceId } from "./device-id";
import { resolveDeviceArea } from "./device-area";
import { showPrompt } from "./dialogs";

/** An action button attached to a notification. */
export interface NotifAction {
  label?: string;
  action?: "dismiss" | "navigate" | "call-service" | "more-info" | "url";
  navigation_path?: string;
  service?: string;
  service_data?: Record<string, unknown>;
  entity?: string;
  url?: string;
  variant?: "primary" | "default";
}

/** A notification as delivered by the backend `teds_cards_backend/subscribe_notifications` command. */
export interface TedNotification {
  id: string;
  title?: string;
  message: string;
  severity?: MessagePopupSeverity;
  icon?: string;
  area?: string;
  area_name?: string;
  created?: string;
  read?: boolean;
  /** Lifetime: "transient" (toast only, never stored), "normal" (auto-clears on
   *  read/dismiss), or "sticky" (marked read on interaction, kept until cleared). */
  persistence?: "transient" | "normal" | "sticky";
  timeout?: number | null;
  source?: string;
  actions?: NotifAction[];
  /** Present on "announcement" notifications: scopes the prominent toast to the
   *  selected areas/devices (both empty = house-wide, shown everywhere). Also carries
   *  the sending device so recipients can Reply straight back to it. */
  announce_targets?: { areas?: string[]; devices?: string[]; source_device?: string; source_device_name?: string };
  /** Client-resolved snooze: the device renders/acts using its own effective settings. */
  snooze?: { kind: "timer" | "alarm"; name: string; area?: string | null };
  /** Set by the backend when a notification is dismissed/read elsewhere: close the toast here. */
  dismissed?: boolean;
}

interface HassLike {
  connection?: {
    subscribeMessage: <T>(cb: (ev: T) => void, msg: { type: string }) => Promise<() => void>;
  };
  callService?: (domain: string, service: string, data?: Record<string, unknown>) => void;
}

export interface NotificationToastOptions {
  hass?: HassLike;
  /** Only toast notifications for this area (unset = all). */
  area?: string;
  /** When false, suppress toasts (e.g. a center card that lists but doesn't pop). */
  enabled?: boolean;
  /** Called whenever a matching notification fires (after the area filter), even if
   *  toasts are suppressed — e.g. to reveal an auto-hidden navbar. */
  onNotify?: () => void;
}

/**
 * Subscribes to backend notifications via the `teds_cards_backend/subscribe_notifications`
 * WebSocket command and pops a MessageBox-style toast for each notification (area-filtered).
 * A dedicated command is used instead of `subscribe_events` because non-admin (kiosk) users
 * are not allowed to subscribe to custom HA events. Deduped by id via the shared popup layer,
 * so multiple subscribing cards won't double-toast.
 */
export class NotificationToastController implements ReactiveController {
  private _sub?: Promise<() => void>;

  constructor(
    host: ReactiveControllerHost,
    private opts: () => NotificationToastOptions,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this._ensure();
  }

  hostUpdated(): void {
    this._ensure();
  }

  hostDisconnected(): void {
    this._sub?.then((unsub) => unsub()).catch(() => undefined);
    this._sub = undefined;
  }

  private _ensure(): void {
    const conn = this.opts().hass?.connection;
    // Keep the shared settings store fed wherever toasts run (for DND + snooze),
    // even on dashboards without a Settings card mounted.
    settingsStore.setHass(this.opts().hass as never);
    if (this._sub || !conn) return;
    this._sub = conn.subscribeMessage<TedNotification>(
      (n) => this._onEvent(n),
      { type: "teds_cards_backend/subscribe_notifications" },
    );
  }

  private _onEvent(n: TedNotification): void {
    if (!n) return;
    // Dismissed/read on another device: close the matching toast here too so a
    // house-wide (or same-area) notification clears everywhere at once.
    if (n.dismissed) {
      dismissMessageBox(`notif-${n.id}`);
      return;
    }
    const { area, enabled, hass, onNotify } = this.opts();
    // Announcements carry their own target scope (areas/devices); everything else
    // uses the card's area filter.
    if (n.announce_targets) {
      if (!this._announcementTargetsMe(hass, n.announce_targets)) return;
    } else if (area && n.area && n.area !== area) {
      // Area-scoped card: show notifications for this area AND house-wide ones.
      return;
    }
    // Do Not Disturb (this device's effective setting): suppress toasts entirely.
    if (settingsStore.effective().do_not_disturb === true) return;
    onNotify?.();
    if (enabled === false) return;
    const actions: ToastAction[] = this._buildActions(hass, n);
    const announcement = !!n.announce_targets;
    showMessageBox({
      key: `notif-${n.id}`,
      severity: n.severity ?? "info",
      title: n.title,
      message: n.message,
      icon: n.icon,
      actions,
      prominent: announcement,
      // Announcement boxes never auto-close locally: the backend dismisses them (at
      // its timeout or on a user dismiss) so the on-screen message and the repeating
      // alert sound always end together. Other notifications use their own timeout.
      duration: announcement
        ? 0
        : typeof n.timeout === "number" && n.timeout > 0
          ? n.timeout * 1000
          : 8000,
      // Manually dismissing the toast marks the notification read (auto-timeout does not).
      onDismiss: () => hass?.callService?.("teds_cards_backend", "mark_read", { id: n.id }),
    });
  }

  /** True when an announcement's target scope includes this device (by id or area),
   *  or when it's house-wide (no areas/devices selected). */
  private _announcementTargetsMe(
    hass: HassLike | undefined,
    targets: { areas?: string[]; devices?: string[] },
  ): boolean {
    const areas = targets.areas ?? [];
    const devices = targets.devices ?? [];
    if (!areas.length && !devices.length) return true; // house-wide
    if (devices.includes(resolveDeviceId())) return true;
    const myArea = resolveDeviceArea(hass as never).area;
    return !!myArea && areas.includes(myArea);
  }

  /** Toast action buttons: synthesized Snooze/Dismiss for completion notifications
   *  (resolved from THIS device's effective settings), else the configured actions.
   *  Announcements from another device also get a Reply button back to the sender. */
  private _buildActions(hass: HassLike | undefined, n: TedNotification): ToastAction[] {
    let actions: ToastAction[];
    if (n.snooze) {
      const { enabled, minutes } = effectiveSnooze(n.snooze.kind);
      const out: ToastAction[] = [];
      if (enabled) {
        out.push({ label: `Snooze (${minutes}min)`, primary: true, handler: () => this._snooze(hass, n, minutes) });
      }
      out.push({ label: "Dismiss", handler: () => hass?.callService?.("teds_cards_backend", "mark_read", { id: n.id }) });
      actions = out;
    } else {
      actions = (Array.isArray(n.actions) ? n.actions : []).map((a) => ({
        label: a.label ?? "OK",
        primary: a.variant === "primary",
        handler: () => this._runAction(hass, n, a),
      }));
    }
    // Reply back to the sender of an announcement (never on the sender's own copy).
    const src = n.announce_targets?.source_device;
    if (src && src !== resolveDeviceId()) {
      actions = [{ label: "Reply", primary: true, handler: () => void this._reply(hass, n) }, ...actions];
    }
    return actions;
  }

  /** Prompt for a reply and send it straight back to the announcement's sender. */
  private async _reply(hass: HassLike | undefined, n: TedNotification): Promise<void> {
    const targets = n.announce_targets;
    const src = targets?.source_device;
    if (!src) return;
    const senderName = targets?.source_device_name || settingsStore.registry()[src]?.name || "the sender";
    const text = await showPrompt(document.body, {
      title: `Reply to ${senderName}`,
      placeholder: "Type your reply\u2026",
      confirmText: "Send",
    });
    if (!text) return;
    const myId = resolveDeviceId();
    const myName = settingsStore.registry()[myId]?.name;
    hass?.callService?.("teds_cards_backend", "announce", {
      message: text,
      title: myName ? `Reply from ${myName}` : "Reply",
      devices: [src],
      source_device: myId,
      persistent: false,
    });
  }

  /** Start a snooze timer (keeping the original name + room) and mark the item read. */
  private _snooze(hass: HassLike | undefined, n: TedNotification, minutes: number): void {
    const s = n.snooze;
    if (!s) return;
    const data: Record<string, unknown> = { name: s.name, minutes };
    if (s.area) data.location = s.area;
    hass?.callService?.("teds_cards_backend", "start_timer", data);
    hass?.callService?.("teds_cards_backend", "mark_read", { id: n.id });
  }

  /** Run a notification action, then dismiss the notification everywhere. */
  private _runAction(hass: HassLike | undefined, n: TedNotification, a: NotifAction): void {
    switch (a.action) {
      case "navigate":
        if (a.navigation_path) {
          history.pushState(null, "", a.navigation_path);
          window.dispatchEvent(new Event("location-changed"));
        }
        break;
      case "call-service":
        if (a.service) {
          const [domain, srv] = a.service.split(".");
          if (domain && srv) hass?.callService?.(domain, srv, a.service_data ?? {});
        }
        break;
      case "more-info":
        if (a.entity) {
          document.body.dispatchEvent(
            new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: a.entity } }),
          );
        }
        break;
      case "url":
        if (a.url) window.open(a.url, "_blank", "noopener");
        break;
      case "dismiss":
      default:
        break;
    }
    hass?.callService?.("teds_cards_backend", "dismiss_notification", { id: n.id });
  }
}
