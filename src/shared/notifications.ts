import type { ReactiveController, ReactiveControllerHost } from "lit";

import { showMessageBox, type MessagePopupSeverity } from "./messagebox-popup";

/** A notification as delivered by the backend `teds_cards_backend_notification` event. */
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
  sticky?: boolean;
  timeout?: number | null;
  source?: string;
  actions?: unknown[];
}

interface HassLike {
  connection?: {
    subscribeEvents: <T>(cb: (ev: T) => void, type: string) => Promise<() => void>;
  };
}

export interface NotificationToastOptions {
  hass?: HassLike;
  /** Only toast notifications for this area (unset = all). */
  area?: string;
  /** When false, suppress toasts (e.g. a center card that lists but doesn't pop). */
  enabled?: boolean;
}

/**
 * Subscribes to the backend `teds_cards_backend_notification` event and pops a
 * MessageBox-style toast for each notification (area-filtered). Deduped by id via
 * the shared popup layer, so multiple subscribing cards won't double-toast.
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
    if (this._sub || !conn) return;
    this._sub = conn.subscribeEvents<{ data: TedNotification }>(
      (ev) => this._onEvent(ev.data),
      "teds_cards_backend_notification",
    );
  }

  private _onEvent(n: TedNotification): void {
    if (!n) return;
    const { area, enabled } = this.opts();
    if (enabled === false) return;
    if (area && n.area !== area) return;
    showMessageBox({
      key: `notif-${n.id}`,
      severity: n.severity ?? "info",
      title: n.title,
      message: n.message,
      duration: typeof n.timeout === "number" && n.timeout > 0 ? n.timeout * 1000 : 8000,
    });
  }
}
