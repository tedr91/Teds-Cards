# Ted's Alarm Card

`type: custom:ted-alarm-card`

Add, view, and enable/disable alarms. Alarms are stored **server-side** so they
fire reliably and survive restarts, and can be scoped to a room/area.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration** — it reads `sensor.teds_alarms`. When an alarm rings it plays on the
> device's configured media player (see [Settings](./settings-card.md)) and pops a
> [notification](./notification-system.md).

---

## Minimal example

```yaml
type: custom:ted-alarm-card
```

## Scoped to a room

```yaml
type: custom:ted-alarm-card
title: Bedroom Alarms
area: bedroom
```

---

## Configuration

### Content

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Alarms` | Header text. |
| `area` | string | *(all)* | Scope to an area: only alarms tagged with it are shown, and new alarms are tagged with it. |
| `show_area_in_title` | boolean | true | Append the scoped area name, e.g. "Alarms (Kitchen)". |
| `show_add` | boolean | true | Show the header "+" button that opens the new-alarm dialog. |

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
