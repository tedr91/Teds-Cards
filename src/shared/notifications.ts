import type { ReactiveController, ReactiveControllerHost } from "lit";

import { showMessageBox, type MessagePopupSeverity, type ToastAction } from "./messagebox-popup";

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
  actions?: NotifAction[];
}

interface HassLike {
  connection?: {
    subscribeEvents: <T>(cb: (ev: T) => void, type: string) => Promise<() => void>;
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
    const { area, enabled, hass, onNotify } = this.opts();
    if (area && n.area !== area) return;
    onNotify?.();
    if (enabled === false) return;
    const actions: ToastAction[] = (Array.isArray(n.actions) ? n.actions : []).map((a) => ({
      label: a.label ?? "OK",
      primary: a.variant === "primary",
      handler: () => this._runAction(hass, n, a),
    }));
    showMessageBox({
      key: `notif-${n.id}`,
      severity: n.severity ?? "info",
      title: n.title,
      message: n.message,
      icon: n.icon,
      actions,
      duration: typeof n.timeout === "number" && n.timeout > 0 ? n.timeout * 1000 : 8000,
    });
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
