<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo4/logo-ondark-512.png">
    <img src="images/logo4/logo-512.png" alt="Ted's Cards" width="320">
  </picture>
</p>

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/hacs/integration) ![GitHub Release](https://img.shields.io/github/v/release/tedr91/Teds-Cards) ![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/tedr91/Teds-Cards) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/tedr91/Teds-Cards/total) ![GitHub Repo stars](https://img.shields.io/github/stars/tedr91/Teds-Cards) [![GitHub License](https://img.shields.io/github/license/tedr91/Teds-Cards)](LICENSE)

> **⚠️ Interim release — testing only.** This is a pre-release build published for testing purposes only and is not intended for production use. Features may change or break without notice.

# Ted's Cards

This is my collection of custom cards for [Home Assistant](https://www.home-assistant.io/) which I use for my HA wall panels and handheld devices. 

After spending months attempting to find an "on/off/brightness" switch that I liked aesthetically, I finally gave up and decided to create my own.  The rest of the cards happened as strived to achieve a consistent look and feel without a ton of styling overrides cluttering up all my YAML files. 😊


---

## ✨ Card Types

| Card | Type | Description |
| --- | --- | --- |
| Light Card | `custom:ted-light-card` | Light tile with click-to-dim halves and an indicator bar. |
| Cover Card | `custom:ted-cover-card` | Cover tile with click-to-position halves and an indicator bar. |
| Button Card | `custom:ted-button-card` | Label or button tile with an optional entity, icon, and tap/hold actions. |
| Expandable Button Card | `custom:ted-button-card` is the trigger; type `custom:ted-expandable-button-card` | A button that opens a popup of child buttons on tap (children can be expandable too). |
| Clock Weather Card | `custom:ted-clock-weather-card` | A large clock with the date and current weather. |
| Remote Card | `custom:ted-remote-card` | Remote control for media devices (e.g. Apple TV and Kaleidescape). |
| Room Card | `custom:ted-room-card` | Overview card for a Home Assistant area. |
| Camera Card | `custom:ted-camera-card` | One or more camera feeds (auto thumbnail or live stream) in single, quad, or multi layouts. |
| Vision Card | `custom:ted-vision-card` | Timeline of AI-analyzed camera events (severity + summaries + thumbnail/clip) via HA's native AI Task. |
| Music Card | `custom:ted-music-card` | Music Assistant player for the current device (wraps droans/mass-player-card; requires it + `mass_queue`). |
| Calendar Card | `custom:ted-calendar-card` | Calendar for the current device (wraps superdingo101/daylight-calendar-card; requires it). |
| Navbar Card | `custom:ted-navbar-card` | Navigation bar pinned to the top or bottom, with buttons and status items in left/center/right zones. |
| Alarm Card | `custom:ted-alarm-card` | Add, view, and enable/disable alarms (requires the Ted's Dashboard System integration). |
| Timer Card | `custom:ted-timer-card` | Start, view, and cancel countdown timers (requires the Ted's Dashboard System integration). |
| Announce Card | `custom:ted-announce-card` | Broadcast spoken (TTS) announcements to devices/areas, with predefined messages and recents (requires the Ted's Dashboard System integration). |
| Assist-Response Card | `custom:ted-assist-response-card` | Display a title + message (+ optional image) pushed by a voice intent or automation, and navigate the targeted screens to it — the visual counterpart to a spoken Assist answer (requires the Ted's Dashboard System integration). |
| Photo Viewer Card | `custom:ted-photo-viewer-card` | View a single photo or a folder album — page through it (arrows/keys), run a crossfade slideshow, favorite it, and set it as your wallpaper (favorite/set-as-wallpaper require the Ted's Dashboard System integration). |

---

## 📸 Screenshots
![Ted's Cards — dark mode](images/showcase-darkmode.png)
![Ted's Cards — light mode](images/showcase-lightmode.png)

---

## 🔧 Requirements

* Home Assistant
* One or more calendar entities (e.g. `calendar.family`, `calendar.work`)

---

## 🚀 Installation

### Recommended: Install via HACS

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=tedr91&repository=ha-teds-card&category=frontend)

OR

<details>
<summary>Add custom repository</summary>

1. Open HACS in Home Assistant.
2. Go to **Frontend** → menu (⋮) → **Custom repositories**.
3. Add `https://github.com/tedr91/Teds-Cards` with category **Dashboard**.
4. Search for **Ted's Cards** and install.
5. Refresh your browser.

</details>

👉 If you don’t have HACS yet, follow: [https://hacs.xyz/docs/use/](https://hacs.xyz/docs/use/)

---

### Manual Installation

<details>

<summary>Without HACS</summary>

1. Download `ted-cards.js` from the [latest release](https://github.com/tedr91/Teds-Cards/releases/latest).
2. Copy it to `<config>/www/community/ted-cards/ted-cards.js`.
3. Add the resource to your dashboard:
   - **Settings** → **Dashboards** → ⋮ → **Resources** → **Add resource**
   - URL: `/local/community/ted-cards/ted-cards.js`
   - Type: **JavaScript Module**
4. Refresh your browser.

💡 After updates, bump the version (`?v=2`) to avoid caching issues.

</details>


---

## 📖 Usage

> 🎨 **Every card** has an **Appearance (general)** section with **Transparency** and **Background blur** sliders — fade the card's surface and blur whatever sits behind it for a frosted-glass look over a dashboard wallpaper. Both default to off (fully opaque, no blur).

### 💡 Light Card

A compact light tile split into two clickable halves by a subtle divider. Supports `light`
entities only. Brightness is shown on a thin vertical indicator bar on the card's left edge.

**Interactions**

The card has **three interactive regions** — the **upper half**, the **lower half**, and the **centered icon** — each of which spans the full card area (padding and hint bars included). Every region responds to **single tap**, **double tap**, and **long press**, and each gesture can be reassigned in the editor's **Switch Behavior** section.

| Region | Single tap (default) | Double tap (default) | Long press (default) |
| --- | --- | --- | --- |
| Upper half | Increase brightness to the next 5% | Full on (100%) | More info |
| Lower half | Turn off | Turn off | More info |
| Icon | Toggle | More info | More info |

Available actions: **Increase brightness**, **Decrease brightness**, **Full on (100%)**, **Turn off**, **Toggle**, **More info**, and **Nothing**.

For **toggle-only** lights (no brightness support), the upper-half single tap defaults to **Full on** and the lower-half single tap to **Turn off**; the left indicator bar shows full when on and empty when off.

<p align="center">
  <img src="images/cards/light-card.png" alt="Light Card preview" width="220" />
</p>

Minimal config:

```yaml
type: custom:ted-light-card
entity: light.living_room
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-light-card
entity: light.living_room
name: Living Room          # optional, defaults to entity friendly name
icon: mdi:floor-lamp       # optional, defaults to entity icon
theme: ted-style           # optional, visual styling: ted-style (default) | ha
```

`theme` (optional) — **Visual styling**, selectable in the editor's **Appearance** section:
- `ted-style` (default): a self-contained "Ted's Home Theater" look (Windows 11 Fluent / Mica-dark) that looks the same regardless of your Home Assistant theme.
- `ha`: follow the active Home Assistant theme (surfaces, text, and accent color).

Brightness is shown on a thin vertical **indicator bar** pinned to the card's left edge (it fills bottom→up with the light's brightness; it is not interactive). Its color — labeled **Indicator bar color** in the editor's **Appearance** section — is set by `indicator_color` (optional) when the light is on:
- `theme` (default): the theme accent color.
- `light`: the light's current color (its `rgb_color`), falling back to a warm tone.
- `other`: a custom color — set `indicator_color_custom` to an `[r, g, b]` array (chosen via the editor's color picker).

`show_indicator` (optional, default `true`, in the **Appearance** section) toggles the indicator bar on or off, and `indicator_width` (optional, px, default `4`) sets its width.

`show_hint` (optional, default `false`, in the **Appearance** section): show a matching **hint bar** up the right edge with **+** / **−** hints, indicating the top half raises brightness and the bottom half lowers it. `hint_width` (optional, px, default `8`) sets the hint bar width.

The icon is centered in the card and lights up when the light is on. `icon_color` (optional, in the **Appearance** section) sets its on color:
- `theme`: the theme accent color.
- `light` (default): the light's current color (its `rgb_color`), falling back to a warm tone.
- `other`: a custom color — set `icon_color_custom` to an `[r, g, b]` array.

`background_on` (optional, in the **Appearance** section): override the card's background color while the light is **on**. Pick a color with the editor's color picker (stored as a `#RRGGBB` hex string). When unset, the theme background is used.

`brushed` (optional, default off, in the **Appearance** section): overlay a brushed-metal sheen just above the background. Pair it with a metallic `background_on` color (e.g. silver `#c0c0c0`) for a brushed-aluminum look.

`rocker` (optional, default on, in the **Appearance** section): when on, the card behaves as a rocker switch — the two halves run separate **UP** / **DOWN** actions and a divider separates them. Turn it **off** to make the whole card a single button that always runs the **Icon** behavior (the UP/DOWN options and divider are hidden). `rocker_effect` (optional, default on, disabled when **Rocker** is off): a Decora-style rocker bevel that makes one half of the card appear raised, pivoting at the center. The raised half follows the state — **top** half raised when off, **bottom** half raised when on.

`orientation` (optional, default `vertical`, directly below **Visual styling**): switch the card to **horizontal**. In horizontal mode the indicator bar runs along the **bottom** (filling left → right), the hint bar runs along the **top**, the divider is vertical, the **right** half is **UP** and the **left** half is **DOWN**, and the name sits on the left with the state on the right (icon centered). The default size becomes 6 × 1 in a grid (Sections) view, or 240 × 80 px elsewhere.

Also in the **Appearance** section: `show_name`, `show_icon`, and `show_state` (all default **on**) toggle the name, centered icon, and the state/brightness label; `name_scale`, `icon_scale`, and `state_scale` (percent, default `100`) scale the name text, icon, and state label. `width` and `height` (px, default `100` × `120` vertical, `240` × `80` horizontal) set the card's fixed size when it is **not** a direct item in a grid (Sections) view — e.g. inside a stack, masonry, or panel view. As a direct grid item the card honors the grid cell size instead.

**Switch Behavior**

The editor's **Switch Behavior** section lets you reassign the action for every region × gesture. It contains three groups — **UP behavior**, **DOWN behavior**, and **Icon behavior** — each exposing a **Single tap**, **Double tap**, and **Long press** action picker. The config keys are `up_tap` / `up_double_tap` / `up_hold`, `down_tap` / `down_double_tap` / `down_hold`, and `icon_tap` / `icon_double_tap` / `icon_hold`. Any option left at its default is omitted from the saved YAML.

```yaml
up_tap: increase           # increase | decrease | full_on | full_off | toggle | more_info | none
down_double_tap: toggle
icon_hold: none
```

**Memory (dimmable lights)**

For dimmable lights you can choose the brightness the light turns **on** to. The editor shows a **Memory** section (only for brightness-capable lights) with three modes:
- `off` (default): turn on at the light's last brightness (standard Home Assistant behavior).
- `static`: always turn on to a fixed brightness — set `memory_value` (1–100 %, default 100).
- `helper`: turn on to the value of an `input_number` / `number` helper, read as a **percentage** (1–100). **Choosing this mode auto-creates and selects a dedicated helper for you** (`input_number.ted_light_mem_<entity>`) — no need to add one in Settings → Helpers. Add a card for the same light elsewhere and it reuses that helper automatically; delete the helper and the card falls back to the default. You can still point `memory_entity` at your own helper instead.

```yaml
memory_mode: static        # off | static | helper
memory_value: 60           # static mode, 1–100 %
# or
memory_mode: helper
memory_entity: input_number.living_room_brightness
```

</details>

### 🪟 Cover Card

A compact cover tile split into two clickable halves by a subtle divider. Supports `cover`
entities only (blinds, shades, shutters, curtains, garage doors, …). The current position is
shown on a thin vertical indicator bar on the card's left edge.

**Interactions**

The card has **three interactive regions** — the **upper half**, the **lower half**, and the
**centered icon** — each spanning the full card area (padding and hint bars included). Every region
responds to **single tap**, **double tap**, and **long press**, reassignable in the editor's
**Switch Behavior** section.

| Region | Single tap (default) | Double tap (default) | Long press (default) |
| --- | --- | --- | --- |
| Upper half | Open more (next 5%) | Fully open | More info |
| Lower half | Close more (next 5%) | Fully closed | More info |
| Icon | Toggle | More info | More info |

The **icon's Toggle** is smart: while the cover is moving it **stops**, otherwise it opens (to the
configured memory position) or closes. Available actions: **Open more**, **Close more**, **Fully
open**, **Fully closed**, **Toggle**, **Stop**, **Tilt open**, **Tilt closed**, **More info**, and
**Nothing**. Tilt actions appear in the editor only for tilt-capable covers.

For **open/close-only** covers (no position support), the upper-half single tap defaults to **Fully
open** and the lower-half to **Fully closed**. Tilt-only covers use their tilt position as the
primary value driven by the up/down regions.

<p align="center">
  <img src="images/cards/cover-card.png" alt="Cover Card preview" width="220" />
</p>

Minimal config:

```yaml
type: custom:ted-cover-card
entity: cover.living_room_blinds
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-cover-card
entity: cover.living_room_blinds
name: Living Room Blinds   # optional, defaults to entity friendly name
icon: mdi:blinds           # optional, defaults to a device-class icon
icon_open: mdi:blinds-open # optional, shown while the cover is open
theme: ted-style           # optional, visual styling: ted-style (default) | ha
```

`icon_open` (optional) sets a different icon to show while the cover is open — e.g. `icon: mdi:garage`
with `icon_open: mdi:garage-open`. When unset, `icon` (or a device-class default) is used in all states.

`theme`, `show_indicator`, `indicator_color`, `indicator_width`, `icon_color`, `show_hint`, and `hint_width`
work as in the Light Card (all in the editor's **Appearance** section). `show_indicator` (**on by
default**) toggles the indicator bar; `indicator_color` (`theme` default / `other` custom) — labeled
**Indicator bar color** — colors it when open, and `indicator_width` (px, default `4`) sets its width.
`show_hint` (**on by default**) shows a right-edge **hint bar** with **up/down chevron** hints, and
`hint_width` (px, default `8`) sets its width. The indicator bar fills from the bottom up with the
cover's current position.

`background_open` (optional, in the **Appearance** section): override the card's background color while the cover is **open**. Pick a color with the editor's color picker (stored as a `#RRGGBB` hex string). When unset, the theme background is used.

`brushed` (optional, default off, in the **Appearance** section): overlay a brushed-metal sheen just above the background. Pair it with a metallic `background_open` color (e.g. silver `#c0c0c0`) for a brushed-aluminum look.

`rocker` (optional, default on, in the **Appearance** section): when on, the card behaves as a rocker switch — the two halves run separate **UP** / **DOWN** actions and a divider separates them. Turn it **off** to make the whole card a single button that always runs the **Icon** behavior (the UP/DOWN options and divider are hidden). `rocker_effect` (optional, default on, disabled when **Rocker** is off): a Decora-style rocker bevel that makes one half of the card appear raised, pivoting at the center. The raised half follows the state — **top** half raised when closed, **bottom** half raised when open.

`orientation` (optional, default `vertical`, directly below **Visual styling**): switch the card to **horizontal**. In horizontal mode the indicator bar runs along the **bottom** (filling left → right), the hint bar runs along the **top**, the divider is vertical, the **right** half is **UP** and the **left** half is **DOWN**, and the name sits on the left with the state on the right (icon centered). The default size becomes 6 × 1 in a grid (Sections) view, or 240 × 80 px elsewhere.

Also in the **Appearance** section: `show_name`, `show_icon`, and `show_state` (all default **on**) toggle the name, centered icon, and the state/position label; `name_scale`, `icon_scale`, and `state_scale` (percent, default `100`) scale the name text, icon, and state label. `width` and `height` (px, default `100` × `120` vertical, `240` × `80` horizontal) set the card's fixed size when it is **not** a direct item in a grid (Sections) view — e.g. inside a stack, masonry, or panel view. As a direct grid item the card honors the grid cell size instead.

**Switch Behavior**

The **Switch Behavior** section reassigns the action for every region × gesture, grouped into **UP
behavior**, **DOWN behavior**, and **Icon behavior**. Config keys are `up_tap` / `up_double_tap` /
`up_hold`, `down_tap` / `down_double_tap` / `down_hold`, and `icon_tap` / `icon_double_tap` /
`icon_hold`. Any option left at its default is omitted from the saved YAML.

```yaml
up_tap: open_step          # open_step | close_step | open | close | toggle | stop | tilt_open | tilt_close | more_info | none
icon_hold: stop
```

**Memory (position-capable covers)**

For covers that support `set_cover_position` you can choose the position the cover **opens** to. The
editor shows a **Memory** section (only for position-capable covers) with three modes:
- `off` (default): open fully (100%).
- `static`: always open to a fixed position — set `memory_value` (1–100 %, default 100).
- `helper`: open to the value of an `input_number` / `number` helper, read as a percentage (1–100).
  **Choosing this mode auto-creates and selects a dedicated helper for you** (`input_number.ted_cover_mem_<entity>`)
  — no need to add one in Settings → Helpers; add a card for the same cover elsewhere and it reuses that
  helper, and deleting the helper falls back to the default. Changing the position from the card also
  writes the new value back to the helper. You can still point `memory_entity` at your own helper instead.

```yaml
memory_mode: static        # off | static | helper
memory_value: 70           # static mode, 1–100 %
# or
memory_mode: helper
memory_entity: input_number.blinds_position
```

</details>

### 🏷️👆 Button Card

A small, versatile tile that works as either a **label** or a **button**. The entity is optional: with
no entity it's a static label (or an action button via the tap/hold actions); with an entity it shows
the entity's state and toggles (or opens more-info) by default. It's also the button type used inside
**Room Card** sections.

<p align="center">
  <img src="images/cards/button-card.png" alt="Button Card preview" width="220" />
</p>

Minimal config (button bound to an entity):

```yaml
type: custom:ted-button-card
entity: light.living_room
```

Minimal config (plain label):

```yaml
type: custom:ted-button-card
name: Hello, world!
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-button-card
entity: light.living_room   # optional, the entity to control / show
name: Living Room           # optional label text, defaults to the entity friendly name
icon: mdi:lightbulb         # optional, defaults to the entity icon
theme: ted-style            # optional, visual styling: ted-style (default) | ha
icon_color: amber           # optional icon color (theme color name or #RRGGBB)
background: '#1c1c1c'        # optional background color override
brushed: false              # optional brushed-metal sheen over the background
neumorphic: false           # raised tile when off/idle, pressed when the entity is active
show_name: false            # show the name/label (default off)
name_scale: 100             # name text size, % (10–300)
show_icon: true             # show the icon
icon_scale: 100             # icon size, % (10–300)
show_state: true            # show the entity state under the name
state_scale: 100            # state text size, % (10–300)
width: 100                  # fixed width (px) when NOT a direct grid (Sections) item
height: 120                 # fixed height (px) when NOT a direct grid (Sections) item
tap_action:                 # optional, see Interactions below
  action: toggle
hold_action:
  action: more-info
double_tap_action:
  action: none
# Badge — a small number badge from any entity (e.g. an unread/notification count)
badge:
  entity: sensor.notifications   # the entity whose state is shown as the badge number
  color: red                     # optional badge background color
  text_color: white              # optional badge text color
  show_when_zero: false          # show the badge even when the value is 0 (default hides it)
# Dynamic highlighting — recolor the button from another entity's value
highlight:
  entity: sensor.days_until_bin_day
  rules:
    - operator: '<='             # is | is_not | > | >= | < | <=
      value: 2
      background_color: red
      icon_color: white          # optional
      halt: true                 # stop checking further rules once this one matches
    - operator: '<='
      value: 5
      background_color: orange
      halt: true
```

`theme` and `brushed` work as in the other cards (see the Light Card section). `icon_color` and
`background` are picked with the editor's color picker; leave them unset to follow the theme.

`neumorphic` (default **off**, in the **Appearance** section): a soft "neumorphic" effect — the tile
looks **raised** when the entity is off/idle (or has no entity) and **pressed in** when the entity is
active (e.g. a light `on`, a cover `open`, a media player `playing`, a lock `unlocked`).

In the **Appearance** section, `show_icon` (default **on**) and `show_name` / `show_state` (default
**off**) toggle the icon, label, and the entity-state line, and `name_scale` / `icon_scale` /
`state_scale` (percent, default `100`) scale each of them. `width` and `height` (px, default `100` ×
`120`) set the card's fixed size when it is **not** a direct item in a grid (Sections) view — e.g.
inside a stack, masonry, or panel view; as a direct grid item the card honors the grid cell.

**Interactions** — the editor's **Interactions** section sets `tap_action`, `hold_action`, and (under
**Add interaction**) `double_tap_action`, using Home Assistant's standard action picker (toggle,
more-info, navigate, call-service, etc.). Defaults adapt to the entity: **tap** is `toggle` for
toggleable domains (light, switch, fan, cover, lock, climate, media_player, …) and `more-info`
otherwise; **hold** is `more-info` when an entity is set. With no entity, both default to nothing.

**Badge** (editor **Badge** section) — overlays a small number from any entity in the top-right corner
(e.g. a notification count). It hides automatically when the value is `0` (or unavailable) unless
**Show when value is zero** is on; the badge and text colors are configurable.

**Dynamic highlighting** (editor **Dynamic highlighting** section) — recolors the button's background
and/or icon from a chosen entity's state. Add one or more **rules**, each comparing the entity with an
operator (`is` / `is not` / `>` / `≥` / `<` / `≤`) and a value (the value becomes a state dropdown for
`is` / `is not`). Rules are checked top-to-bottom and can be dragged to reorder; turn on **stop
processing** to halt at the first match — handy for threshold ladders like `≤ 2 → red`, `≤ 5 → orange`,
`≤ 10 → yellow`.

</details>

### �️👆 Expandable Button Card

A **Button Card that opens a popup of child buttons on tap**. The trigger looks and is configured
exactly like a normal **Button Card** (icon/name/state, theme, badge, dynamic highlighting); tapping it
opens a native popover holding a configurable set of child buttons. Each child is a full **Button
Card** with its own icon, colors, and actions — and a child can itself be **another Expandable Button
Card**, opening a nested popup without closing its parent. Selecting a leaf button runs its action and
closes the popup.

Minimal config:

```yaml
type: custom:ted-expandable-button-card
name: Scenes
icon: mdi:movie-open
items:
  - type: custom:ted-button-card
    name: Movie
    icon: mdi:movie-open
    tap_action: { action: call-service, service: script.movie_night }
  - type: custom:ted-button-card
    name: Bright
    icon: mdi:white-balance-sunny
    tap_action: { action: call-service, service: script.bright }
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-expandable-button-card
# --- Trigger appearance: any Button Card option (icon/name/state, theme, badge, highlight, …) ---
name: Scenes
icon: mdi:movie-open
theme: ted-style
# --- Popup ---
popup_layout: grid          # grid (default) | list
popup_max_columns: 3        # optional cap on grid columns; unset = size to the button count
popup_title: Scenes         # optional heading shown at the top of the popup
flip_icon: true             # flip the trigger icon (e.g. a chevron) 180° while open (default true)
items:                      # child buttons shown in the popup
  - type: custom:ted-button-card
    name: Movie
    icon: mdi:movie-open
    tap_action: { action: call-service, service: script.movie_night }
  - type: custom:ted-expandable-button-card   # a nested expandable child
    name: More
    icon: mdi:dots-horizontal
    items:
      - type: custom:ted-button-card
        name: Reading
        icon: mdi:book-open-variant
```

The trigger's own tap/hold/double-tap actions are ignored — tapping the trigger always opens the
popup. Configure each child's actions on the child button itself.

**Popup** (editor) — **Popup layout** is **Grid** (square tiles) or **List** (a single vertical column).
For the grid, **Max columns** is optional — leave it empty and the grid sizes to the number of buttons
(a single row); set it to wrap onto multiple rows after that many columns. **Popup title** adds an
optional heading. **Flip icon when open** (default **on**) rotates the trigger icon 180° while the popup
is open — handy for a chevron that flips to point the other way. The popover anchors to the trigger,
opening downward (flipping up if there isn't room) and dismisses on outside-click or `Esc`.

**Popup buttons** (editor) — add **Button** or **Expandable button** children, drag to reorder, and edit
each inline with its own card editor. Nested expandable children open their own sub-popups, so you can
build multi-level menus behind a single tile.

</details>

### �🕒⛅ Clock Weather Card

A large clock with the current date and weather, designed to sit transparently on top of a dashboard
background. The clock, date, and weather can each be shown or hidden and positioned independently.

<p align="center">
  <img src="images/cards/clock-weather-card.png" alt="Clock Weather Card preview" width="420" />
</p>

Minimal config:

```yaml
type: custom:ted-clock-weather-card
weather_entity: weather.home
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-clock-weather-card
theme: ted-style            # optional, visual styling: ted-style (default) | ha
force_transparent: true     # transparent card background (default true)
background: '#1c1c1c'        # background color override (only used when force_transparent: false)
brushed: false              # optional brushed-metal sheen over the background
# Clock
show_clock: true
clock_size: large           # small (60%) | medium (80%) | large (100%, default) | extra_large (120%) | custom
clock_size_custom: 100      # size %, used when clock_size: custom (10–400)
clock_offset: 0             # horizontal position: 0 = left, 50 = center, 100 = right
time_format: auto           # auto (default) | 12h | 24h | custom
time_format_custom: 'H:MM'  # token string, used when time_format: custom
# Date
show_date: true
date_size: standard         # standard (default) | custom
date_size_custom: 100       # size %, used when date_size: custom
date_format: standard       # standard (default) | custom
date_format_custom: 'dddd, MMMM D'   # token string, used when date_format: custom
date_below_clock: false     # stack the date directly under the clock
date_offset: 100            # horizontal position: 0 = left, 50 = center, 100 = right
# Weather
show_weather: true
weather_entity: weather.home   # a weather entity
weather_size: standard      # standard (default) | custom
weather_size_custom: 100    # size %, used when weather_size: custom
show_weather_icon: true     # show the condition icon (default true)
icon_style: fancy           # fancy (default) | cool | basic
show_current_temp: true     # show the current temperature
weather_above_clock: false  # place the weather above the clock instead of below
weather_offset: 100         # horizontal position: 0 = left, 50 = center, 100 = right
```

`theme` and `brushed` work as in the other cards (see the Light Card section). `force_transparent`
(default **on**) drops the card background so the clock floats over your dashboard; turn it **off** to
use the theme background or a `background` color override.

The editor groups the rest into **Clock Settings**, **Date Settings**, **Weather Settings**, and a
**Layout** section:

- **Sizes** — `clock_size`, `date_size`, and `weather_size` use preset percentages, or set them to
  **Custom** to enter an exact percent (`*_size_custom`).
- **Time / date format** — `time_format` (`auto` follows your Home Assistant locale) and `date_format`
  both offer a **Custom** mode where you supply a token string (`time_format_custom`,
  `date_format_custom`).
- **Layout** — `show_clock` / `show_date` / `show_weather` toggle each element, and `clock_offset`,
  `date_offset`, and `weather_offset` slide each one horizontally (0 left ↔ 50 center ↔ 100 right).
  `date_below_clock` stacks the date under the clock, and `weather_above_clock` moves the weather
  above it.

**Weather icon styles** (`icon_style`, shown when **Show weather icon** is on): **Fancy** (animated
Meteocons — the default), **Cool** (the Home Assistant frontend weather SVGs), or **Basic** (Material
Design weather icons). See [Credits](#credits) for icon attribution.

</details>

### 🎛️ Remote Card

A remote-control card for **Apple TV** and **Kaleidescape** players. The device family is auto-detected
from the remote entity's integration — Apple TV uses the built-in `apple_tv` integration, while
Kaleidescape uses the custom [`kaleidescape_strato`](https://github.com/tedr91/HA-kaleidescape-strato)
integration (note: **not** the built-in Kaleidescape integration). Buttons send `remote.send_command`
calls to the selected entity.

<p align="center">
  <img src="images/cards/remote-card.png" alt="Remote Card preview" width="260" />
</p>

Minimal config:

```yaml
type: custom:ted-remote-card
remote_entity: remote.living_room_apple_tv
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-remote-card
remote_entity: remote.living_room_apple_tv             # required, the remote. entity (Apple TV or Kaleidescape)
media_player_entity: media_player.living_room_apple_tv  # recommended, drives state + play/pause + power
name: Living Room            # optional header name
theme: manufacturer          # visual styling: manufacturer (default) | ted-style | ha
background: '#1c1c1c'         # optional background color override
brushed: false               # optional brushed-metal sheen over the background
show_icon: true              # show the device icon in the header
icon_scale: 100              # icon size, % (10–300)
show_name: false             # show the name in the header
name_scale: 100              # name size, % (10–300)
scale: 100                   # overall card scale, % (50–200)
show_status_indicator: false # on/off/playing status dot in the header
# Apple TV only — quick-launch app buttons (each value is a media_player source name)
app_launch_1: Netflix
app_launch_2: Disney+
app_launch_3: YouTube
# Kaleidescape only — where the Home button navigates
kaleidescape_home: home      # home (default) | movie_covers | movie_list | movie_collections | system_status
```

`remote_entity` (required) is the `remote.*` entity that receives the button commands. The entity
pickers are limited to the two supported integrations, and the **device family is detected
automatically** from your selection — there's no family dropdown.

`media_player_entity` (recommended) is a matching `media_player.*` entity used to show the current
state and to make the **power** and **play/pause** buttons state-aware. When you pick the remote, the
card tries to auto-fill the matching media player (an entity on the same device first, then by name).

`theme` (in the **Appearance** section) offers **Manufacturer's Style** (default — a per-device look
resembling the real remote), **Ted's Style** (the self-contained "Ted's Home Theater" look), or
**Home Assistant theme**. `background` and `brushed` work as in the other cards (see the Light Card
section). The header is controlled by `show_icon` / `icon_scale`, `show_name` / `name_scale`, and
`show_status_indicator`; `scale` resizes the whole remote (50–200%).

**App Launchers** (Apple TV only) — up to six quick-launch buttons. Each `app_launch_N` is a
media_player **source** name; when a media player is configured the editor offers a dropdown of its
available sources.

**Home button target** (Kaleidescape only) — `kaleidescape_home` chooses where the **Home** button
navigates: **Home** (default), **Movie covers**, **Movie list**, **Movie collections**, or **System
status**.

</details>

### 🏠 Room Card

An overview card for a Home Assistant **area**, with a compact **status bar** along the top edge and
one or more **button sections** below it. The area is the card's primary selection, made in the
editor's **Room** section (an Area picker fed by your Home Assistant areas); it also seeds default
temperature/occupancy entities for new status items.

<p align="center">
  <img src="images/cards/room-card.png" alt="Room Card preview" width="420" />
</p>

Minimal config:

```yaml
type: custom:ted-room-card
area: living_room
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-room-card
area: living_room          # the Home Assistant area id
name: Living Room          # optional title override, defaults to the area's name
theme: ted-style           # optional, visual styling: ted-style (default) | ha
brushed: false             # optional brushed-metal sheen over the background
status_items:              # optional, the top status bar (see below)
  - type: temperature
    entity: sensor.living_room_temperature
  - type: occupancy
    entity: binary_sensor.living_room_motion
  - type: brightness
    entity: light.living_room
  - type: volume
    entity: media_player.living_room
  - type: led
    entity: binary_sensor.living_room_window
sections:                  # optional, grids of buttons below the status bar
  - title: Lights
    max_rows: 0            # 0 = unlimited; otherwise caps rows (5 buttons/row)
    buttons:
      - type: custom:ted-light-card
        entity: light.living_room
      - type: custom:ted-cover-card
        entity: cover.living_room
      - type: custom:ted-button-card
        name: Scene
```

`theme` and `brushed` work as in the other cards (see the Light Card section).

**Header** — the top strip shows an optional **icon** and the room **name**. In the editor's **Header**
section: **Display icon in header** (default off; pick the icon below **Name**) with an optional **Icon
size override**, **Display name in header** (default on) with an optional **Name size override**, and
**Display header divider line** (default on).

**Room Photo** — an optional photo behind the card UI (above the background/brushed effect, below the
header, status, and buttons). In the editor's **Room Photo** section:

- **Show photo** (default on).
- **Photo source** — **Bundled** (a curated set served from a CDN; pick one or leave **Auto** to match
  the room name), **Custom** (upload your own via the HA image picker), or **Camera feed** (pick a
  `camera` entity, then choose its **Camera view** — Auto thumbnail (default) / Live stream — and
  **Fit mode** — Cover / Contain / Fill).
- **Photo placement** — **Top of card** (default), **Below header**, or **Fill card**.
- **Photo height** (px) — leave empty to show the full image at card width; set a height to crop it
  (hidden for **Fill**).
- **Photo alignment** — the vertical focal point (Top / Center / Bottom) used when the photo is cropped.
- **Edge Gradient (Scrim)** — darken any of the **Top / Left / Right / Bottom** edges so text/buttons
  stay readable. Sensible defaults per placement (Top→top edge, Fill→top+bottom, Below header→none).
- **Photo opacity** (default 100%).

The default (Show photo on, Auto) silently shows nothing when the room name doesn't match a bundled
photo or the image can't be loaded.

**Status bar** — a small strip of items pinned to the top edge of the card, managed in the editor's
**Status items** section (add, reorder, delete). Each item is one of:

| Type | Shows | Entity |
| --- | --- | --- |
| `temperature` | Icon + value | any sensor (auto-filled from the area) |
| `occupancy` | Icon + value | any sensor (auto-filled from the area) |
| `brightness` | Tap-to-open vertical slider | `light`, `number`, or `input_number` |
| `volume` | Tap-to-open volume slider (double-tap mutes) | `media_player` |
| `led` | Colored status dot | any entity |

Each item also accepts an optional `icon` and `name`. `led` items accept `on_color` / `off_color`
and an advanced `colors` map (state → color) for per-state colors.

**Button sections** — one or more grids of buttons below the status bar, managed in the editor's
**Button sections** section (add, reorder, delete sections; add, reorder, delete buttons within each).
Each button is a `ted-button-card`, `ted-cover-card`, `ted-light-card`, or `ted-camera-card`, edited inline with
that card's own editor. Buttons lay out 5 per row as squares; set a section's **Max rows** to cap the
height (`0` = unlimited). When the buttons overflow the cap, the last visible cell becomes a **…**
button that reveals the rest.

Each section has a **Section title** plus a **Show title in card** toggle (default **off**) and a
**Title alignment** selector (Left / Center / Right; disabled while the title is hidden). The title
still labels the section in the editor even when it isn't shown in the card.

**Spacer** — both the status strip and button sections can hold a **Spacer**: a transparent,
non-interactive placeholder whose only option is its **Size** in px. Status-strip spacers add a
horizontal gap (default `24` px); button-section spacers reserve an empty square cell (default `100`
px, matching a button).

</details>

---

### 📷 Camera Card

<a id="camera-card"></a>

A **camera feed** — or **several** — rendered with Home Assistant's own picture-glance image element so
each feed gets both **auto** thumbnail polling and **live** streaming for free. Show one camera, or lay
out multiple in a **Quad** (2×2) or **Multi** (one big feed plus a strip of smaller ones) arrangement. Use it on its own, as a Room
Card button, or as a Room Card photo source.

Minimal config:

```yaml
type: custom:ted-camera-card
cameras:
  - entity: camera.front_door
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-camera-card
layout: single              # optional: single (default) | quad | big-small ("Multi")
big_small_position: right   # optional (Multi only): right (default) | bottom
big_small_width: 25         # optional (Multi only): small-feed strip width, % of the card
cameras:                    # required — one or more cameras, shown in order
  - entity: camera.front_door
    name: Front Door         # optional camera name, defaults to the entity's friendly name
    camera_view: auto        # optional per-camera: auto (thumbnail, default) | live (stream)
    enabled: true            # optional, set false to hide this camera from the layout
  - entity: camera.back_yard
    camera_view: live
show_name: false            # optional, overlay each camera's name along the bottom edge
name_size: 14               # optional, camera-name font size in px (default 14)
fit_mode: cover             # optional: cover (default) | contain | fill
aspect_ratio: "16:9"        # optional, e.g. "16:9" or "1.78" (ignored in grid layout)
theme: ted-style            # optional, visual styling: ted-style (default) | ha
brushed: false              # optional brushed-metal sheen behind the feed
width: 800                  # optional manual width (px), ignored in grid layout
height: 450                 # optional manual height (px), ignored in grid layout
tap_action:                 # optional, defaults to More Info of the tapped camera
  action: more-info
double_tap_action:
  action: none
```

- **Cameras** — add one or more `camera.*` entities. In the editor, use **Auto populate cameras** to
  add every camera at once, **drag** to reorder, the **switch** in each row header to show/hide a camera,
  and the **trash** icon to remove one. Each camera has an optional **Camera Name** (defaults to the
  entity's friendly name) and its own **view** (auto thumbnail or live stream).
- **Layout** — **Single** (one feed), **Quad** (2×2), or **Multi** (one large feed plus a strip of
  smaller ones, positioned to the **right** or **bottom**, with an adjustable **Small feeds width**
  that auto-sizes to keep every feed equal as you show/hide cameras). Slots with
  no camera show an empty placeholder.
- **Per-camera view** — each feed is an **Auto thumbnail** (default; periodically refreshed still) or a
  **Live stream** (continuous video), set in that camera's editor row.
- **Camera name overlay** — **Show Camera Name** overlays each feed's name along the bottom edge, with a
  configurable **Camera name size**.
- **Long-press a feed** — opens a quick popup to switch **that** feed between **Auto thumbnail** and
  **Live stream**, and (for any non-primary feed) **Make primary camera** to swap it into the big slot.
  These are live-view tweaks only and reset on reload — the editor holds the saved defaults.
- **Fit mode** — how each image fills its box: **Cover** (default), **Contain**, or **Fill**.
- **Aspect ratio** — optional, sets the card's shape when it isn't sized by the dashboard grid.
- **Sizing** — in a **grid** (sections) layout the card fills its grid cell; otherwise it uses the
  optional **Width** / **Height** (defaulting to 800×450). `theme` and `brushed` work as in the other
  cards (see the Light Card section).
- **Interactions** — **Tap** defaults to **More Info** of the tapped camera; **Double tap** defaults to
  none. Both accept the standard Home Assistant action options. (Long-press is reserved for the view popup.)
- **Efficient** — feeds only stream while the card is on-screen and the browser tab is visible, and
  hidden cameras use no bandwidth.

</details>

### 🧭 Navbar Card

A **navigation bar pinned to the top or bottom** of the dashboard. Each section holds an ordered mix of
**buttons** — each a full **Button Card**, so they get icons, colors, actions, badges, and dynamic
highlighting — and **status items** such as the **time**, **date**, **weather**, or a room's temperature,
brightness and volume, arranged in **left / center / right** zones. The **center** zone stays pinned to the
exact middle regardless of what's on the sides, so a "Home" button can sit perfectly centered.

> ℹ️ The navbar overlays the dashboard and reserves space so your content isn't hidden underneath it.
> It's brand new — please report any layout quirks.

Minimal config:

```yaml
type: custom:ted-navbar-card
sections:
  - placement: center
    items:
      - type: custom:ted-button-card
        name: Home
        icon: mdi:home
```

<details>
<summary><b>Detailed options</b></summary>

```yaml
type: custom:ted-navbar-card
theme: ha                 # optional, visual styling: ha (default) | ted-style
alignment: bottom         # bottom (default) | top | left | right (left/right = vertical bar)
bar_type: snap            # snap (edge-to-edge, default) | float (centered) — top/bottom only
size: 48                  # bar thickness in px; buttons size from this
min_width: 16             # float only: minimum bar width in px
max_width: 920            # float only: maximum bar width in px
background: ""            # optional card background color (theme name or hex/rgb)
transparency: 0           # 0–100% — fade the bar's background
blur: 0                   # 0–100% — blur the dashboard behind the bar
sections:                 # up to 5 sections
  - placement: left       # left | center | right (which zone the section sits in)
    align: center         # left | center | right (alignment of items within the section)
    visible: true         # optional, show/hide the section
    overflow: true        # optional, collapse items that don't fit into a “…” popover
    items:                # ordered mix of buttons, status items, and popups
      - type: datetime                      # status item (date + time; set display: time/date to show one)
        display: date
      - type: weather                       # status item (auto-picks a weather entity, or set entity:)
  - placement: center
    items:
      - type: custom:ted-button-card  # a button
        name: Home
        icon: mdi:home
        nav_button_size: normal             # normal (default) | wide
  - placement: right
    items:
      - type: datetime                      # status item — updates live
        display: time
      # A "popup menu" is an Expandable Button Card: a normal button tile that opens a
      # popover of child buttons (configure layout / title / nesting on the card itself).
      - type: custom:ted-expandable-button-card
        icon: mdi:dots-horizontal
        popup_layout: grid                  # grid (default) | list
        popup_max_columns: 3                # optional cap on grid columns (unset = fit items)
        popup_title: Settings               # optional heading
        flip_icon: true                     # flip the trigger icon 180° while open (default true)
        items:
          - type: custom:ted-button-card
            name: Settings
            icon: mdi:cog
```

- **Navbar alignment** — pin the bar to the **Bottom** (default) or **Top** edge (horizontal), or the **Left** / **Right** edge for a **vertical** bar. A vertical bar is always snap (Float is hidden), clears the header & sidebar, and maps the section zones top→**left**, middle→**center**, bottom→**right**.
- **Navbar type** — **Snap** spans edge-to-edge; **Float** centers the bar with margins and rounded corners (top/bottom bars only). A floating bar **auto-sizes to fit its buttons** (just a little wider) — unless it has **left-** or **right-**zone items, in which case it spans the full (maximum) width so those items can pin to the edges.
- **Minimum width** / **Maximum width** (float only) — the bounds the floating bar is sized within (defaults **16** and **920** px).
- **Size** — the bar thickness in pixels; buttons size automatically from it.
- **Sections** (up to **5**) — each sits in a **left / center / right** zone and has its own content
  **alignment**. Sections, and the items inside them, are added and **dragged to reorder** in the
  editor. The **center** zone is pinned to the exact center of the bar, independent of the left/right
  content.
- **Items** — each section's **+ Add item** menu adds a **button**, a **status item**, or a **popup**, mixed in
  any order and **dragged to reorder**.
- **Buttons** — a full **Button Card** (entity, icon, colors, actions, badge, dynamic
  highlighting). **Button size** is **Normal** (square) or **Wide**.
- **Status items** — **Time**, **Date** and **Weather**, plus a room's **Temperature**, **Occupancy**,
  **Brightness**, **Volume**, an entity **Status LED**, and a **Spacer**. Brightness and volume open a
  slider on tap, and the clock updates live.
- **Popups** — the **+ Add item** menu's **Popup menu** adds an **Expandable Button Card**: a normal
  button tile that opens a popover of child buttons. Configure its layout (Grid with optional **Max
  columns**, or List), an optional **title**, **Flip icon when open**, and nested menus on the card
  itself — handy for tucking extra controls behind one button.
- **Overflow** — when a section's items don't fit the bar, the extras **auto-collapse into a “…” popover**
  (turn **Auto-collapse overflow** off per section to keep them inline).

</details>

### ⏰ Alarm Card

Add, view, and enable/disable **alarms**. Requires the **[Ted's Dashboard System](https://github.com/tedr91/Teds-Dashboard-System)**
integration (which owns the alarms and fires them reliably server-side). The card reads
`sensor.teds_alarms` and calls the backend's `add_alarm` / `update_alarm` / `remove_alarm` services.

```yaml
type: custom:ted-alarm-card
title: Alarms            # optional header (default "Alarms")
entity: sensor.teds_alarms   # optional, override the alarms sensor
show_add: true           # optional, show the add form (default true)
theme: ha                # optional, visual styling: ha (default) | ted-style
```

Each alarm row has an enable toggle, its label (and any description / repeat days), the time, and a
delete button. The add form takes a label and time. **Appearance** (in the editor) offers **Visual
styling**, **Transparency** / **Background blur**, a **Brushed** sheen, and a **Subtle shadow** toggle —
matching the other cards.

### ⏱️ Timer Card

Start, view, and cancel **countdown timers**. Also requires the **Ted's Dashboard System** integration;
the card reads `sensor.teds_timers` and calls `start_timer` / `cancel_timer`.

```yaml
type: custom:ted-timer-card
title: Timers            # optional header (default "Timers")
entity: sensor.teds_timers   # optional, override the timers sensor
show_add: true           # optional, show the start form (default true)
theme: ha                # optional, visual styling: ha (default) | ted-style
```

Running timers show a **live countdown** with a cancel button; the start form takes a name and an
**H / M / S** duration; recently used timers appear as quick-start chips. The same **Appearance**
options as the Alarm card apply.

---

## 📋 Changelog

The newest entry below is used as the GitHub Release notes by the release workflow, so it shows in
the Home Assistant / HACS **update** dialog when you update. Newest first.

### v0.9.35

- **New: Vision Card + AI camera event analysis.** Opt a camera into Vision Analysis (Settings → Vision) and its motion / person / animal / vehicle detections are captured and analyzed by Home Assistant's built-in AI Task — producing a severity, a one-line and a detailed summary, and a best-frame thumbnail (plus a short clip). The new Vision card shows a live timeline of events with severity filtering, a detail view, and mark-reviewed / delete. No third-party vision integration required — it works with any AI provider that offers an AI Task entity (e.g. OpenAI or Ollama).

### v0.9.34

- **Assist mic auto-disables over HTTP.** When a device loads the dashboard over an insecure (HTTP) connection — where the browser can't use the microphone — the navbar mic button now shows disabled, and tapping it explains that voice needs an HTTPS connection (e.g. your Nabu Casa URL) instead of silently failing.

### v0.9.33

- **Wallpaper fades in instead of snapping.** The background now crossfades when a view first loads and when you switch albums (not just on manual next / cycle transitions): the first image fades in over the theme background, and album/image changes crossfade. Plain view-to-view navigation with the same wallpaper still repaints instantly. Respects the Slideshow transition setting (set it to “none” to keep hard cuts).

### v0.9.32

- **Nightstand profile trims the navbar.** Picking the **Nightstand** device type now also limits the launcher to **Home**, **Music**, and **Alarms/Timers**, and shows only the Center (launcher) navbar section — for a minimal bedside bar.

### v0.9.27

- **Edit the navbar from Settings.** The navbar's five sections and their items (weather, date/time, the view launcher, status icons, buttons) are now managed in **Settings → Navbar → Navbar sections** — global, with an optional per-device override — instead of being hard-coded in the dashboard YAML. Don't want the weather or clock? Just remove them. The bar comes pre-populated to match the previous layout, so nothing changes until you edit it.
- **Side navbars self-heal.** A left/right (vertical) navbar could occasionally render collapsed into chevrons on first load until you nudged its size; it now re-measures automatically once its layout settles, so it shows correctly on its own.

### v0.9.26

- **Floating side navbars.** The navbar's **Float** mode now works when the bar is aligned **Left** or **Right**, not just top/bottom. A floating vertical bar detaches from the edge with rounded corners, centers along its height, and hugs its content (with top/bottom items pinned it keeps full height). The **Min/Max width** bounds become **length** (height) bounds for a vertical float, and the hold-menu **Float** toggle is now available on side bars.

### v0.9.25

- **Room-scoping fix.** A device with no room assigned now only sees and receives house-wide timers and notifications, instead of every room's — matching how the timer list itself already filtered.
- **Slideshow crossfade.** The background wallpaper now crossfades when the slideshow advances to the next image, reusing the Photos **Slideshow transition** and **Crossfade duration** settings (no new settings).
- Calendars now default to the **Ted's Style** theme, and **Automatic Night Mode** now defaults to the Sun (dusk → dawn) schedule.

### v0.9.24

- **Assist-Response conversation history.** The Assist-Response view is now a scroll-back conversation log: it keeps recent turns (You → Assistant), restores them when you open the view, appends new answers live, and auto-scrolls to the newest while dimming older turns for context. Voice answers now include the recognized question.

### v0.9.23

- **Voice Assist fixes.** Voice requests now send the panel's device id, so room-aware commands work: **"show the cameras"** navigates to the Cameras view, timers create a Ted's timer on the panel (no more "unexpected error"), and the correct room is used. The mic now plays a short chime when it starts listening. The overlay shows the conversation as a single box that accumulates each turn (You → Assistant) and stays up until a little after the spoken answer finishes (long answers no longer vanish early). Every answer is also mirrored to the Assist-Response view so opening it shows the latest response.

### v0.9.22

- **New: browser-based voice Assist.** A device can now run the Home Assistant Assist pipeline in the dashboard itself and show its own self-dismissing voice overlay, instead of the Companion app's native Assist dialog. Adds a push-to-talk microphone button in the navbar (mid-right) and an experimental continuous wake word mode (off by default). The overlay shows the live state (listening → your words → the answer) and clears itself when the answer finishes; nightstands/handhelds show the full-screen Assist-Response view while wall panels show a compact toast. New **Voice** settings group. Requires the dashboard to be served over HTTPS (browser microphone requirement) — see the [Voice Assist docs](documentation/voice-assist.md).

### v0.9.21

- **Improved** the "Assign devices to a room" dialog: a non-admin (kiosk) account now sees only the current screen's device, and admins see the current device pinned to the top with a clear "This device" badge and highlight.

### v0.9.20

- **Fixed:** the "Assign this screen to a room" prompt could appear on panels that already have a room (it was being triggered by *other* unassigned devices). It now prompts only when this panel's own device has no room, and the fix dialog marks this screen so it's clear which device to set.

### v0.9.19

- **Voice timers on your dashboard.** On a Ted's Dashboard panel, "set a timer for 10 minutes" now creates a timer with a live countdown on the Timers view — and you can cancel, pause, resume, or add/remove time by voice. Phones and other devices keep Home Assistant's native timers.
- **Room‑aware setup helper.** If a panel isn't assigned to a room (so voice commands can't tell which room you mean), it now prompts you with a one‑tap "Set the room" fix. New General → Advanced option controls whether wall‑panel accounts may set their own room.

### v0.9.18

- **Full voice control (with Ted's Dashboard System).** Speak to play music, make announcements, set or adjust the thermostat, and ask for your next alarm, active timers, or next calendar appointment — spoken answers also appear on the Assist-Response screen, and voice-started timers now show on the Timers view.
- **New Settings → Thermostats options** for voice climate control: *Voice zone names* (map a spoken room name to a thermostat), *Auto turn on* (turn an off thermostat on without asking), and a *Min heat/cool gap*.
- Added *Notifications* and *Settings* dashboard-path options so voice “show notifications” / “go to settings” can navigate here.

### v0.9.17

- **Auto-refresh on update.** A new Settings → General → Advanced option (on by default) reloads each device once automatically when the dashboard is updated, so the new files take effect without a manual refresh. Turn it off per-device if you prefer.

### v0.9.16

- **Calendar icons resolve smarter.** A calendar whose icon is a non-MDI glyph (e.g. `fluent-emoji:party-popper`) now automatically uses the matching `mdi:` icon when one exists — so it shows a real glyph instead of a generic calendar. (The name list is served locally by Ted's Dashboard System; no internet needed.)

### v0.9.15

- **Consistent empty states.** The Camera and Photo Viewer cards now show the same clean, centered message (with a Settings button) as the Climate, Music, and Calendar cards when nothing's configured yet — instead of a big opaque panel.
- **Cameras default to the “Multi” layout** (one large feed with smaller thumbnails) for a new device, instead of the auto grid.

### v0.9.14

- **Fixed: Welcome-page setup tips reappear.** The “better layout for this screen” suggestions and the “register this device” prompt were being hidden by Home Assistant's built-in card visibility (it doesn't understand the card's device/screen conditions). Ted's Message Box now uses its own `visible_when` key instead of `visibility`, so those tips show again.

### v0.9.13

- **Kiosk-mode prompt is tidier.** The one-time “Try Kiosk mode” nudge drops its redundant “Dismiss” button (“Not now” already does that) and its text now points you to Settings for Ted's Dashboard System to turn it on/off.

### v0.9.12

- **Kiosk mode is now opt-in.** It no longer turns on by default; instead, a registered device shows a one-time prompt offering to enable it (with “Enable”, “Not now”, and “Don’t ask again”). You can still toggle it anytime in Settings.

### v0.9.11

- **Kiosk mode now hides the Home Assistant header too.** HA's native kiosk only hides the sidebar; the top header/tab bar is now collapsed as well for a clean full-screen wall-panel look.
- **Automatic Night Mode is now off by default** and turns on automatically for a device set to the **Nightstand** type. Switching a device back to “not set” returns it to the Welcome view and clears its night-mode setting.
- **Sun-based night schedule.** Night mode can now follow the Sun integration — **sunset→sunrise** or **dusk→dawn** — instead of fixed times (falls back to manual times when the Sun integration isn't available). The manual start/end fields only show when “Manual times” is selected.
- **Backgrounds:** the Bing “Photo of the Day” attribution icon no longer lingers after switching the slideshow to another album.

### v0.9.10

- **No more Single-Image background flicker on navigation.** In Single Image wallpaper mode, switching views no longer re-fetches and re-paints the same image (which caused a one-off flicker, especially for uploaded images) — it now skips redundant repaints like Slideshow mode already did.

### v0.9.9

- **“Enable music on this device” is admin-only.** Adding a Music Assistant player changes Music Assistant’s configuration, which only admins can do — so non-admin sessions now see an explanatory note instead of a button that would fail.
- **Consistent Climate empty state.** When a device has no thermostats, the Climate view now shows the standard message card (readable over the wallpaper) with a Settings button, matching the other views.

### v0.9.8

- **Registering also syncs your Browser ID to the login session**, so the device's id (and its name/area) survive cleared local storage.
- **“Update Name / Area” is admin-only.** Non-admin users now see a clear note that renaming a device or changing its area can only be done by an administrator, instead of a button that bounced back to the home dashboard.

### v0.9.7

- **One-tap device registration.** When a device isn't registered with Browser Mod (so it has no name or area), the welcome page now shows a helper you can tap to register it right there — no trip to the Browser Mod page. The status card’s “Device Name / Area” and “Browser Mod” rows also open a small popup: register the device when it’s unregistered, or jump to its name/area settings when it is.
- **Layout tips only when they apply.** The “A better layout for this screen” suggestions now appear only once the device is registered, so an unregistered device isn’t nudged prematurely.

### v0.9.6

- **Alarm & timer navbar icons no longer go blank.** The alarm and timer status items in the navbar could show just their count badge with a missing icon; they now always render.
- **Smarter new-alarm defaults.** New alarms now default to weekdays (Mon–Fri). Clearing every day makes a one-shot alarm that rings once and then disables itself (shown as “Once”), instead of quietly saving as every day.
- **Announce niceties.** The Announce view’s “Add some” link now opens the Announce tab in Settings directly, and in Settings the “Add a message” button now sits above the message list.
- **Devices stay online for announcements.** A device now sends a periodic presence heartbeat, so it no longer shows as “offline” in the Announce target list and announcements sent to the current device play their audio.

### v0.9.5

- **Music setup runs from the start.** A device now sets itself up as a Music Assistant player proactively on load — including recovering a device that failed before — so you no longer see a setup prompt or have to click "Try again" on a device that can finish automatically.

### v0.9.4

- **Clearer music-setup guidance.** The status card now shows a short, scannable state ("Music Assistant setup needed") instead of a long, truncated message, and the full step-by-step guidance arrives as a persistent Ted notification you can read in the notification center.

### v0.9.3

- **Music auto-setup now reports through the Ted notification engine.** When a device can't set itself up as a Music Assistant player automatically (Music Assistant requires an admin token, or you're on an external server), you now get a persistent, reviewable notification with the next step — instead of a toast that vanished before you could read it. The status card shows "Music Assistant setup needed" with a **Try again** button.

### v0.9.2

- **Music auto-setup: clearer feedback + fixes.** While a device sets itself up as a Music Assistant player, the Music and Media Player status row now shows an "Initializing… please wait" badge, and if setup doesn't finish it shows a clear message with a **Try again** button — a failed attempt no longer fails silently. Fixed the status row that wrapped its status icon onto a new line when an action button was present. Added browser-console logging (prefixed `[teds MA auto-expose]`) to help diagnose setup issues.

### v0.9.1

- **Music on this device, automatically.** A registered device now sets itself up as a Music Assistant player on its own — no button, no steps — so you can play music through the screen you're on (when Music Assistant runs as the Home Assistant add-on). Prefer real speakers? Pick one in Settings → Sounds; a new **Auto-set-up this device for music** toggle lets you opt a device out. A device that's asleep now reads as "offline / sleeping" instead of looking broken.

### v0.9.0

- Initial public preview release — the baseline we are using for real-world testing ahead of a v1.0.0 release.

## Development

```sh
npm install
npm run build      # produces dist/ted-cards.js
npm run watch      # rebuild on change (with sourcemaps)
npm run typecheck  # tsc --noEmit
```

To test against a running Home Assistant instance, copy `dist/ted-cards.js` into `<config>/www/` and add it as a Lovelace resource (type: JavaScript Module).

---

## 💪 Support

If you'd like to support future development, simply following and starring the projects you enjoy is more than enough. ❤️

But please take a look in the Acknowledgements section below and consider supporting those amazing creators instead!

---

## 💕 Acknowledgements

The **Clock Weather Card** was inspired by [Patrick Kissling](https://github.com/pkissling)'s [clock-weather-card](https://github.com/pkissling/clock-weather-card). 
- His card is fantastic and has more weather info and such so I recommend you check it out!


The **"Fancy"** animated weather icons I used are from [Meteocons](https://github.com/basmilius/meteocons) by [Bas Milius](https://github.com/basmilius). 
  - If you'd like to support **Bas**' work: 

    [![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-pink?style=for-the-badge&logo=github)](https://github.com/sponsors/basmilius)


The **Remote Card** was heavily inspired by the *outstanding* [Firemote](https://github.com/PRProd/HA-Firemote) card by Doug Nelson ([PRProd](https://github.com/PRProd)). Firemote supports so many devices/remotes and is very well done! My remote card pales in comparison and only really exists because of the specific look/feel I want for my home theater control panels. 
  - Please consider supporting **PRProd**'s work: 

    [![Buy me a coffee](https://img.shields.io/badge/Donate-Buy%20me%20a%20coffee-yellow?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/prprod) 


The **Room Card** was loosely inspired by [Clooos](https://github.com/Clooos)'s [Bubble-Card](https://github.com/Clooos/Bubble-Card), whose button-driven layout shaped how my card came together. Bubble-Card is simply amazing and *very* feature-rich! 
- If you'd like to support **Clooos**' work: 

  [![Buy me a beer](https://img.shields.io/badge/Donate-Buy%20me%20a%20beer-yellow?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/clooos) 
  [![PayPal](https://img.shields.io/badge/Donate-PayPal-blue?logo=paypal&style=for-the-badge)](https://www.paypal.com/donate/?business=MRVBV9PLT9ZPL&no_recurring=0&item_name=Hi%2C+I%27m+Clooos+the+creator+of+Bubble+Card.+Thank+you+for+supporting+me+and+my+passion.+You+are+awesome%21+%F0%9F%8D%BB&currency_code=EUR) 
  [![Patreon Clooos](https://img.shields.io/badge/Patreon-Clooos-orange?logo=patreon&style=for-the-badge)](https://www.patreon.com/Clooos)

--- 

## License

[MIT](./LICENSE)
