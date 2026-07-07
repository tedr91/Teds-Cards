# Ted's Notification Center Card

`type: custom:ted-notification-card`

A **notification center**: a bell header with an unread badge that lists the
notifications from the [Ted's Notification System](./notification-system.md). Unlike
the compact navbar bell (a popover), this is a full always-visible card suited to a
dashboard column or sidebar.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration.** Without it the card shows: *"Install the Ted's Cards Backend
> integration to use notifications."*

---

## What it does

- Lists notifications newest-first, each with a severity icon, title, message,
  relative time ("5m ago"), optional area tag, and any action buttons.
- Shows an **unread badge** in the header and a **Mark all read** footer button.
- **Clear all** button in the header (scoped to the card's area if set).
- Tapping a row marks it read; tapping ✕ dismisses it.
- Optionally **pops toasts** for new notifications (like the navbar bell does).
- **Device-area scoped**: shows the resolved device area's notifications **plus**
  house-wide ones (see [scoping](#area-scoping)).

---

## Minimal example

```yaml
type: custom:ted-notification-card
```

That's it — with the backend installed it lists all notifications and toasts new
ones.

## Scoped, no toasts, custom header

```yaml
type: custom:ted-notification-card
title: Office alerts
area: office
show_toasts: false
max_items: 20
```

---

## Configuration

### Content

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Notifications` | Header text. |
| `area` | area id | *(auto)* | Scope the card to a specific area. When omitted, the card resolves the **current device's** area and shows that area + house-wide items. |
| `max_items` | number | `50` | Maximum notifications to list. |

### Behaviour

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_toasts` | boolean | `true` | Pop a toast for each new notification (area-filtered). Set `false` to only list, never pop. |
| `mark_read_on_open` | boolean | `false` | Mark everything (in scope) read whenever the card is shown. When `false`, rows are marked read individually on tap. |

### Header

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_header_icon` | boolean | `true` | Show the bell icon. |
| `header_icon_size` | number (%) | `100` | Scale the bell icon. |
| `show_header_name` | boolean | `true` | Show the `title` text. |
| `header_name_size` | number (%) | `100` | Scale the title text. |
| `header_divider` | boolean | `false` | Draw a divider line under the header. |

### Appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `ted-style` \| `ha` | `ha` | Card styling. `ted-style` uses the Ted's Cards look. |
| `background` | ui_color | | Background colour override. |
| `transparency` | number (0–100) | | Background transparency. |
| `blur` | number (px) | | Backdrop blur (translucent themes). |
| `brushed` | boolean | `false` | Brushed-metal overlay. |
| `shadow` | boolean | `true` | Card drop shadow. |
| `scale` | number (%) | `100` | Zoom the whole card. |

---

## Area scoping

The card resolves the device's area through the same chain as the rest of the
system (config `area` → View Assist → browser_mod → `localStorage` → unknown) and
lists that area's notifications **plus** house-wide (area-less) ones. See
[Device-area scoping](./notification-system.md#device-area-scoping).

- Setting `area` **pins** the card to one room (useful for a fixed wall panel).
- Omitting `area` makes a single card definition work per-device across a shared
  dashboard.

The header **Clear all** and **Mark all read** actions operate on the scoped set
(they pass the resolved area to the backend).

---

## Rows & actions

Each row renders:

- A **severity icon** (the notification's `icon`, else a severity default).
- An **unread dot** while unread.
- The **title**, **relative time**, and **message**.
- An **area tag** (only when the card isn't already pinned to an area).
- **Action buttons** defined on the notification. Tapping an action performs it and
  dismisses the notification. Supported actions: `navigate`, `call-service`,
  `more-info`, `url`, `dismiss` (see
  [Actions](./notification-system.md#actions)).

Toasts popped by this card behave exactly like the system toasts, including
[cross-device dismissal](./notification-system.md#cross-device-dismissal).

---

## Related

- [Ted's Notification System](./notification-system.md) — the backend, services,
  sensor, events, and toasts.
- [Ted's MessageBox Card](./messagebox-card.md) — a static/dismissible banner (not
  backend-driven).
- The **navbar / Room Card `notifications` status item** — a compact bell popover
  version of this card. See
  [the status item docs](./notification-system.md#the-notifications-status-item-bell).
