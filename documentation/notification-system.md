# Ted's Notification System

A server-backed notification pipeline for the Ted's Cards ecosystem. Notifications
are created and persisted **server-side** by the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
integration, then surfaced on the frontend as **toasts**, a **Notification Center
card**, and a **navbar / Room Card bell**. Notifications can be scoped to an area,
so each device only sees what's relevant to the room it's in.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration** (HACS). Without it, `sensor.teds_notifications` and the
> `teds_cards_backend.*` services don't exist and the notification UI shows an
> "Install the Ted's Cards Backend integration" hint.

---

## Architecture at a glance

```
                          ┌──────────────────────────────────────────┐
                          │        Ted's Cards Backend (Python)        │
   automations / cards ──▶│  teds_cards_backend.notify (+ alarms,      │
   (call services)        │  timers that auto-notify)                  │
                          │                                            │
                          │  • persistent store (survives restarts)    │
                          │  • sensor.teds_notifications               │
                          │  • fires event teds_cards_backend_          │
                          │    notification                            │
                          └───────────────┬────────────────────────────┘
                                          │  WebSocket:
                                          │  teds_cards_backend/subscribe_notifications
                                          ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                     Ted's Cards (frontend)                     │
        │  • Toast pop-ups (NotificationToastController)                 │
        │  • Notification Center card (custom:ted-notification-card)     │
        │  • Navbar / Room Card "notifications" status item (bell)       │
        │  All device-area scoped: show this area + house-wide items.    │
        └──────────────────────────────────────────────────────────────┘
```

Everything flows through **one** store, so a finished timer, a ringing alarm, and
a manual `notify` call all appear in the same list and toast the same way.

---

## The notification object

Each notification stored by the backend has this shape (exposed in the sensor's
`notifications` attribute and delivered over the WebSocket subscription):

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique id. Passing an existing `id` to `notify` **replaces** (upserts) that notification. |
| `title` | string | Bold heading line. |
| `message` | string | Body text. |
| `severity` | string | `info` \| `success` \| `warning` \| `danger` \| `tip`. Drives the accent color and default icon. |
| `icon` | string \| null | MDI icon (e.g. `mdi:alarm`). Falls back to a severity-appropriate icon. |
| `area` | string \| null | Area id the notification is scoped to. `null` = **house-wide** (shows everywhere). |
| `area_name` | string \| null | Friendly name of `area`, resolved server-side. |
| `created` | string | ISO-8601 timestamp. Rendered as "just now / 5m ago / 2h ago / 3d ago". |
| `read` | boolean | Whether it has been marked read. |
| `persistence` | string | `transient` \| `normal` \| `sticky`. Controls lifetime (see below). Default `normal`. |
| `timeout` | number \| null | Toast auto-dismiss time in **seconds**. `0`/unset → default 8s toast. |
| `actions` | array | Optional action buttons (see [Actions](#actions)). |
| `source` | string | Origin: `service`, `alarm`, `timer`, etc. |

The store keeps the **50** newest notifications (FIFO).

---

## Services

All services are in the `teds_cards_backend` domain.

### `teds_cards_backend.notify`

Create (or replace) a notification.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `title` | ✅ | string | Heading. |
| `message` | ✅ | string | Body. |
| `severity` | | `info`\|`success`\|`warning`\|`danger`\|`tip` | Default `info`. |
| `icon` | | icon | MDI icon. |
| `area` | | area | Scope to a room. Omit / `null` = house-wide. |
| `timeout` | | number (0–600 s) | Toast duration. `0` = default (8s). |
| `persistence` | | `transient`\|`normal`\|`sticky` | Default `normal`. `transient` = toast only, never stored; `normal` = stored, auto-cleared when read/dismissed; `sticky` = stored, marked read on interaction and kept until cleared. |
| `id` | | string | Provide to **update** an existing notification instead of adding a new one. |
| `actions` | | list | Action buttons (see below). |

```yaml
action: teds_cards_backend.notify
data:
  title: Laundry
  message: Washer finished
  severity: success
  icon: mdi:washing-machine
  area: laundry_room      # omit for house-wide
  timeout: 30
```

### `teds_cards_backend.dismiss_notification`

Remove a notification entirely.

| Field | Required | Type |
| --- | --- | --- |
| `id` | ✅ | string |

### `teds_cards_backend.mark_read`

Mark one, an area's worth, or all notifications as read.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `id` | | string | A single notification. |
| `area` | | area | All notifications for this area. |

Omit both to mark **everything** read.

### `teds_cards_backend.clear_notifications`

Remove notifications.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `area` | | area | Only this area's notifications. Omit to clear **all**. |

> `mark_read`, `dismiss_notification`, and `clear_notifications` each broadcast a
> **dismissal signal** so any toast currently showing that notification closes on
> **every** device — see [Cross-device dismissal](#cross-device-dismissal).

---

## Actions

A notification (or a `notify` call) can carry action buttons. Each action:

| Field | Type | Description |
| --- | --- | --- |
| `label` | string | Button text (default `OK`). |
| `action` | string | `dismiss` \| `navigate` \| `call-service` \| `more-info` \| `url`. |
| `navigation_path` | string | For `navigate`. |
| `service` | string | For `call-service`, e.g. `light.turn_on`. |
| `service_data` | object | Data for `call-service`. |
| `entity` | string | For `more-info`. |
| `url` | string | For `url` (opens in a new tab). |
| `variant` | `primary` \| `default` | Button styling. |

Running any action also dismisses the notification.

```yaml
action: teds_cards_backend.notify
data:
  title: Front door
  message: Motion detected
  severity: warning
  icon: mdi:motion-sensor
  actions:
    - label: View camera
      action: navigate
      navigation_path: /lovelace/cameras
      variant: primary
    - label: Dismiss
      action: dismiss
```

---

## The sensor: `sensor.teds_notifications`

| | |
| --- | --- |
| **State** | Number of **unread** notifications. |
| **Attribute `notifications`** | Full list of notification objects (newest first). |
| **Attribute `unread`** | Unread count. |
| **Attribute `total`** | Total count. |

Cards read this sensor to render lists and badge counts. It updates in real time
(local push).

---

## Events & the WebSocket subscription

The backend fires the Home Assistant event **`teds_cards_backend_notification`**:

- **On create** — the full notification object.
- **On read / dismiss / clear** — a dismissal signal: `{ "id": "<id>", "dismissed": true }`.

Because Home Assistant blocks **non-admin** users (kiosk / Wallpanel dashboards)
from subscribing to custom events via `subscribe_events`, the cards do **not**
listen to this event directly. Instead they use a dedicated WebSocket command that
any authenticated user may call:

```
teds_cards_backend/subscribe_notifications
```

The command forwards each `teds_cards_backend_notification` event's data to the
subscriber. Event-triggered automations can still listen to
`teds_cards_backend_notification` directly.

---

## Toasts

Any card that mounts a `NotificationToastController` (the Notification Center card,
the navbar bell, the Alarm/Timer cards) pops a **MessageBox-styled toast** for each
new notification. Toasts are:

- **De-duplicated** by notification id (key `notif-<id>`) across all subscribing
  cards, so multiple cards never double-toast the same notification.
- **Auto-dismissed** after `timeout` seconds (default **8s** when `timeout` is
  `0`/unset). Auto-timeout does **not** mark the notification read.
- **Manually dismissable** with the ✕ button, which marks the notification **read**
  on the backend.
- **Action-capable** — the notification's action buttons render on the toast.

### Area filtering

A toast is shown on a device only when the notification's area matches the
device's area **or** the notification is house-wide:

```
show if:  notification has no area  (house-wide)
      OR  device area is unknown
      OR  notification.area === device area
```

### Cross-device dismissal

When you dismiss a toast on one device (✕ → `mark_read`), the backend broadcasts a
`{ id, dismissed: true }` signal. Every other device that's still showing that
toast closes it immediately (without re-triggering `mark_read`, so there's no
feedback loop). This means a **house-wide** alarm/timer that popped on every screen
clears from every screen the moment you dismiss it on one. The same applies to
`dismiss_notification` and `clear_notifications`.

> Cross-device dismissal requires **Ted's Cards Backend v1.0.9+** and **Ted's Cards
> v1.0.65+**. Older combinations still work; they just don't sync the dismissal.

---

## Device-area scoping

Notifications, toasts, the navbar bell, and the Notification Center card all resolve
the **current device's area** and show that area's notifications **plus** house-wide
(area-less) ones. The area is resolved through this chain (first match wins):

1. An explicit `area` set on the card / status item (config override).
2. **browser_mod** — the browser's registered device area.
3. A per-device value saved in `localStorage` (`ted_device_area`).
4. If none resolve, the device is treated as "area unknown" and sees everything
   (some cards show a one-time "set this device's area" banner).

Because the area is resolved **per device at runtime**, a single shared dashboard /
navbar works correctly on every screen without per-device YAML.

---

## Where notifications appear

| Surface | What it is | Docs |
| --- | --- | --- |
| **Toasts** | Transient pop-ups for new notifications. | This page. |
| **Notification Center card** | `custom:ted-notification-card` — a bell + unread badge that lists notifications. | [notification-card.md](./notification-card.md) |
| **Navbar / Room Card bell** | A `notifications` status item inside the Navbar or Room Card. | See below. |

### The `notifications` status item (bell)

Add a bell to a Navbar Card or Room Card's `status_items` / items:

```yaml
- type: notifications
  icon: mdi:bell-outline      # optional; defaults to bell / bell-badge
  area: kitchen               # optional; omit to auto-resolve the device area
  hide_when_empty: true       # optional; hide the bell when there are none
```

| Option | Type | Description |
| --- | --- | --- |
| `type` | `notifications` | Required. |
| `icon` | string | Bell icon. Defaults to `mdi:bell-badge` when unread, else a bell. |
| `area` | string | Scope override. Omit to resolve the device's area (see above). |
| `hide_when_empty` | boolean | Hide the bell entirely when the (scoped) list is empty. |

Tapping the bell opens a popover list; each row can be tapped to read/expand it,
and dismissed with ✕. "Clear all" clears the scoped notifications.

---

## Recipes

**House-wide announcement**

```yaml
action: teds_cards_backend.notify
data:
  title: Dinner
  message: Dinner is ready!
  severity: info
  icon: mdi:silverware-fork-knife
  # no area → shows on every device
```

**Room-scoped reminder that only pops in the office**

```yaml
action: teds_cards_backend.notify
data:
  title: Standup
  message: Daily standup in 5 minutes
  area: office
  timeout: 300
```

**Update a live notification in place** (same `id`)

```yaml
action: teds_cards_backend.notify
data:
  id: garage_door
  title: Garage
  message: Garage door is still open
  severity: warning
  icon: mdi:garage-open
```

**Clear a room's notifications**

```yaml
action: teds_cards_backend.clear_notifications
data:
  area: kitchen
```
