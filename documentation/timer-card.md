# Ted's Timer Card

`type: custom:ted-timer-card`

Start, view, and cancel countdown timers. Timers run **server-side** so they keep
counting across restarts and reloads, and can be scoped to a room/area.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration** — it reads `sensor.teds_timers`. When a timer finishes it plays on
> the device's configured media player (see [Settings](./settings-card.md)) and pops
> a [notification](./notification-system.md).

---

## Minimal example

```yaml
type: custom:ted-timer-card
```

## Scoped to a room, with the start form

```yaml
type: custom:ted-timer-card
title: Kitchen Timers
area: kitchen
show_add: true
section_order: [add, active, recent]
```

---

## Configuration

### Content & sections

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Timers` | Header text. |
| `area` | string | *(all)* | Scope to an area: only timers tagged with it are shown, and new timers are tagged with it. |
| `show_area_in_title` | boolean | true | Append the scoped area name, e.g. "Timers (Kitchen)". |
| `show_active` | boolean | true | Show the "Current Running" list of active timers. |
| `show_add` | boolean | true | Show the "New Timer" start form. |
| `show_recent` | boolean | true | Show the "Recent Timers" quick-restart chips. |
| `section_order` | string[] | `["active","recent"]` | Order of the sections (`active`, `add`, `recent`). |

### Header

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_header_icon` | boolean | true | Show the header icon. |
| `header_icon_size` | number (%) | 100 | Header icon size (10–400). |
| `show_header_name` | boolean | true | Show the header title. |
| `header_name_size` | number (%) | 100 | Header title size (10–400). |
| `header_divider` | boolean | false | Divider line under the header. |

### Appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | number (%) | 100 | Overall card scale (50–200). |
| `theme`, `background`, `transparency`, `blur`, `brushed`, `shadow` | | | See [Appearance & theming](./README.md#appearance--theming-shared). |

> Active timers show a live countdown; long-press a recent preset for actions.
> Pause/resume and duration edits are supported on active timers.
