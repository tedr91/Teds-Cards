# Ted's Calendar Card

`type: custom:ted-calendar-card`

A full-featured calendar for the **current device**. It wraps the third-party
[**Daylight Calendar Card**](https://github.com/superdingo101/daylight-calendar-card)
(`custom:daylight-calendar-card`) and feeds it the calendars chosen for this device in
**Settings → Calendars** — so one shared dashboard shows the right calendars on each
device. Ted's styling defaults (colours, combined calendars, badges, etc.) are baked in,
so a view only needs to place the card and pick a default view.

---

## Requirements

This card renders `custom:daylight-calendar-card`, which you install once via HACS:

1. **Daylight Calendar Card** — the
   [`daylight-calendar-card`](https://github.com/superdingo101/daylight-calendar-card)
   Lovelace card (HACS → Frontend). This provides the `custom:daylight-calendar-card`
   element.
2. **Ted's Cards Backend** (`teds_cards_backend`) — needed for the per-device
   **Settings → Calendars** list (this card's default source).

> If `custom:daylight-calendar-card` isn't installed, the card shows a **"Calendar card
> not installed"** message with steps (and an **Open HACS** button when the HACS panel is
> present) instead of a broken card. It swaps itself for the real calendar automatically
> once the dependency finishes loading.

---

## Minimal example

Drive the calendars from this device's Settings list (the recommended setup):

```yaml
type: custom:ted-calendar-card
calendar_source: settings
default_view: month
fill: true
```

## Fixed calendars (no per-device Settings)

```yaml
type: custom:ted-calendar-card
calendar_source: config
entities:
  - calendar.family
  - calendar.holidays_in_united_states
default_view: week
```

## Overriding the baked-in Daylight config

Anything in `calendar_config` is merged into the embedded `daylight-calendar-card`,
winning over Ted's defaults (`type`, `entities`, and `default_view` are managed by this
card):

```yaml
type: custom:ted-calendar-card
calendar_source: settings
default_view: week
fill: true
calendar_config:
  hide_header: true
  hide_controls: true
  rolling_days_week_compact: 5
```

---

## Options

| Option | Default | Description |
| --- | --- | --- |
| `calendar_source` | `settings` | Where the calendars come from: `settings` (this device's Calendars list) or `config` (the card's `entities`). |
| `entities` | – | `calendar.*` entities to show when `calendar_source: config`. |
| `default_view` | `month` | The Daylight Calendar view to open on (`month`, `week`, `schedule`, `agenda`). |
| `fill` | `false` | Fill the parent area (e.g. a dashboard view content cell) instead of sizing to content. |
| `calendar_config` | `{}` | Extra options merged into the embedded Daylight Calendar card (wins over the baked-in defaults). |
| `empty_title` / `empty_message` | – | Override the empty-state message (settings mode with no calendars and no fallback). |
| `missing_title` / `missing_message` | – | Override the missing-dependency message text. |
| `settings_path` | `[root]/settings?tab=calendars` | Where the empty-state **Settings** button navigates. `[root]` is your dashboard root. |

---

## How the calendars are chosen

In `settings` mode the card uses this device's per-device **Calendars** list from
**Settings → Calendars** (the global list defines the available calendars; each device
curates its own subset). If neither the Settings list nor the card's `entities` resolve
any calendars, the card falls back to Ted's baked-in default calendars, so it always shows
something out of the box.
