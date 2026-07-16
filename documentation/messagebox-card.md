# Ted's MessageBox Card

`type: custom:ted-messagebox-card`

A **dismissible message banner** with optional action buttons — shown inline in the
layout, pinned to a screen edge, or as a modal overlay. Think of it as a static,
declaratively-configured "notice" you place on a dashboard: setup tips, warnings,
onboarding hints, "this panel is view-only" banners, etc.

> **Not** backend-driven. Unlike the [Notification System](./notification-system.md),
> the MessageBox card needs no integration — its content is defined entirely in the
> card config, and dismissal state is stored **locally in the browser**.

---

## How it differs from the Notification system

| | MessageBox Card | Notification System |
| --- | --- | --- |
| Source of content | Card YAML | Backend `notify` service / alarms / timers |
| Needs the backend | No | Yes |
| Persistence | Browser `localStorage` / `sessionStorage` dismiss flag | Server-side store |
| Good for | Static banners, tips, conditional notices | Dynamic, cross-device alerts |

---

## Minimal example

```yaml
type: custom:ted-messagebox-card
severity: info
title: Heads up
message: This dashboard is optimised for tablets.
```

## Dismissible tip (remembered forever on this browser)

```yaml
type: custom:ted-messagebox-card
severity: tip
icon: mdi:lightbulb-on-outline
title: Tip
message: Long-press any room to open its settings.
dismiss_key: rooms-longpress-tip
actions:
  - label: Got it
    action: dismiss
    variant: primary
```

---

## Configuration

### Content

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `severity` | `info` \| `success` \| `warning` \| `danger` \| `tip` | `info` | Accent color + default icon. |
| `icon` | string | *(severity default)* | MDI icon. |
| `title` | string | | Bold heading. |
| `message` | string | | Body text. |
| `docs_url` | string | | Optional "learn more" link shown under the message. |
| `docs_label` | string | | Label for the `docs_url` link. |

### Display

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `display` | `inline` \| `pinned` \| `modal` | `inline` | How the banner is presented. `inline` = in the layout flow; `pinned` = fixed to a screen edge; `modal` = centered overlay. |
| `pinned_side` | `top` \| `center` \| `bottom` | `top` | Which edge to pin to when `display: pinned`. |

### Dismissal

| Option | Type | Description |
| --- | --- | --- |
| `dismiss_key` | string | Storage key that makes a dismissal **persist**. Without it, `dismiss` actions only hide the card for the current view (until reload). |

Dismissal is **CSS-safe** (no inline scripts). Flags are stored under the
`ted-mb:` prefix:

- **`dismiss`** action → writes a **persistent** flag to `localStorage`
  (`ted-mb:<dismiss_key>`). The banner stays hidden on this browser until the flag
  is cleared.
- **`dismiss-session`** action → writes a **per-session** flag to `sessionStorage`.
  The banner reappears in a new browser session.

The card is hidden when either flag for its `dismiss_key` is set.

### Visibility conditions — `visibility`

Optional list of standard visibility conditions — the **same engine used by the
Navbar Card** (a superset of Home Assistant's native card `visibility:`). Omit
`visibility` to always show. Top-level conditions are **AND-ed** (every one must
pass); use an `or` / `not` condition to combine them differently.

| `condition` | Keys | Shows the card when… |
| --- | --- | --- |
| `screen` | `media_query` | The CSS media query matches (e.g. `(max-width: 600px)`, `(orientation: portrait)`). |
| `card` | `registered` / `not_registered` (string or list) | `not_registered` passes when any listed custom card type is **not** registered (warn about a missing dependency); `registered` passes only when all are present. |
| `state` | `entity`, `attribute`, `state` / `state_not` | The entity's state (or attribute) matches / does not match. |
| `numeric_state` | `entity`, `above`, `below` | The entity's numeric value is within range. |
| `user` | `users` | The current user is one of the listed user ids. |
| `and` / `or` / `not` | `conditions` | Boolean combination of nested conditions. |

```yaml
type: custom:ted-messagebox-card
severity: warning
title: Missing dependency
message: Install the Mushroom cards to use this view.
visibility:
  - condition: card
    not_registered:
      - custom:mushroom-template-card
```

```yaml
type: custom:ted-messagebox-card
severity: info
message: Guest mode is active.
visibility:
  - condition: state
    entity: input_boolean.guest_mode
    state: "on"
```

### Actions

Action buttons rendered under the message.

| Field | Type | Description |
| --- | --- | --- |
| `label` | string | Button text. |
| `icon` | string | Optional MDI icon. |
| `variant` | `primary` \| `secondary` | `primary` is filled with the accent; `secondary` (default) is subtle. |
| `action` | see below | What the button does. |

**Action kinds** (`action:`):

| Kind | Extra fields | Behavior |
| --- | --- | --- |
| `dismiss` | *(uses `dismiss_key`)* | Persistently hide the banner. |
| `dismiss-session` | *(uses `dismiss_key`)* | Hide for this browser session only. |
| `navigate` | `navigation_path` | Navigate within the dashboard. |
| `url` | `url_path` | Open a URL. |
| `perform-action` / `call-service` | `perform_action` / `service`, `data`, `target` | Call a Home Assistant service/action. |
| `more-info` | `entity` | Open the entity's more-info dialog. |
| `none` | | No-op (label-only). |

```yaml
type: custom:ted-messagebox-card
severity: danger
icon: mdi:water-alert
title: Leak detected
message: Water sensor triggered in the basement.
display: modal
actions:
  - label: Shut off water
    icon: mdi:valve-closed
    variant: primary
    action: perform-action
    perform_action: switch.turn_off
    target:
      entity_id: switch.main_water_valve
  - label: More info
    action: more-info
    entity: binary_sensor.basement_leak
  - label: Dismiss
    action: dismiss-session
```

### Appearance overrides

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `ted-style` \| `ha` | | Card styling. |
| `transparency` | number (0–100) | | Background transparency. |
| `blur` | number (px) | | Backdrop blur. |
| `shadow` | boolean | `true` | Drop shadow. |

---

## Notes

- The visual editor exposes all of the above (severity, display, dismiss key,
  `visibility`, and an actions list builder).
- Because dismissal state is per-browser, a `dismiss_key` banner dismissed on one
  device still shows on others — this is intentional (each screen decides for
  itself). For cross-device, server-backed messages use the
  [Notification System](./notification-system.md) instead.

---

## Related

- [Ted's Notification System](./notification-system.md) — dynamic, backend-driven,
  cross-device notifications.
- [Ted's Notification Center Card](./notification-card.md) — lists backend
  notifications.
