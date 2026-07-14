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
  - entity: calendar.ted_outlook_calendar
    name: Ted
    color: "#43a1ce"
    person: person.ted_roberts
    icon_source: person
    readonly: true
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
| `calendar_source` | `config` | Where the calendars come from: `config` (the card's `entities`) or `settings` (this device's Calendars list). |
| `entities` | – | `calendar.*` entities to show when `calendar_source: config`. |
| `default_view` | `month` | The Daylight Calendar view to open on (`month`, `week`, `schedule`, `agenda`). |
| `fill` | `false` | Fill the parent area (e.g. a dashboard view content cell) instead of sizing to content. |
| `calendar_config` | `{}` | Extra options merged into the embedded Daylight Calendar card (wins over the baked-in defaults). |
| `empty_title` / `empty_message` | – | Override the empty-state message (no calendars selected). |
| `missing_title` / `missing_message` | – | Override the missing-dependency message text. |
| `settings_path` | `[root]/settings?tab=calendars` | Where the empty-state **Settings** button navigates. `[root]` is your dashboard root. |

### Appearance

| Option | Default | Description |
| --- | --- | --- |
| `name` | – | The calendar title shown in the header. |
| `show_name` | `true` | Show the title/name in the header. |
| `theme` | `ha` | Surface styling: `ha` (Home Assistant theme) or `ted-style` (Ted's frosted theme = translucent surface + blur, applied behind the calendar). |
| `background_color` | – | Card background colour (standard Ted colour picker: theme colour or custom). Painted on a frosted surface behind the calendar. |
| `transparency` | – | Background see-through 0–100% (empty = none). |
| `blur` | – | Background blur 0–100% (empty = none) — frosts whatever shows through a translucent background. |
| `show_header` | `true` | Show the calendar header (`hide_header` inverse). |
| `header_color` | – | Header background colour (standard Ted colour picker; maps to Daylight's `header_color`). |
| `header_transparency` | theme | Header background see-through 0–100% (maps to Daylight's `header_background_opacity`). Empty follows the theme (`ted-style` = 30). A card-wide `blur` frosts it. |
| `allow_calendar_toggling` | `true` | Show the calendar on/off toggle list in the header (only when the header is shown; `hide_calendars` inverse). |
| `weather_sensor` | – | A `weather.*` entity shown in the header (`header_weather_sensor`). |
| `width` / `height` | – | Fixed size in px. **Only** applied when the card isn't a direct item in a grid (Sections) view. |

### Per-calendar options

In `config` mode each entry in `entities` may be an object with these keys (or a bare
`calendar.*` id). Each maps to the matching Daylight per-calendar setting:

| Option | Default | Description |
| --- | --- | --- |
| `entity` | – | The `calendar.*` entity (required). |
| `name` | calendar's name | Display name (`calendar_names`). |
| `readonly` | `true` | Prevent editing events (`readonly_calendars`). |
| `person` | – | A `person.*` whose avatar represents the calendar (`calendar_person_entities`). |
| `icon` | calendar's icon | Badge icon (`calendar_badge_icons`). |
| `icon_source` | `person` | Badge shows the linked person's avatar (`person`) or the icon (`icon`). |
| `color` | auto | Event colour, hex (`colors`). |

---

## How the calendars are chosen

In `settings` mode the card shows this device's per-device **Calendars** list from
**Settings → Calendars**. The **Global** list defines the available calendars (the
allow-list); each device then curates its own subset. If a device hasn't customized its
list, it shows the whole Global list. If no calendars are selected (the Global list is
empty), the card shows an empty **"No calendars yet"** prompt with a Settings button
rather than picking calendars for you. Ted's styling defaults (colours, names, combined
calendars, badges, etc.) still apply to whichever calendars you choose.
