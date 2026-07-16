# Automatic Night Mode

Automatic Night Mode dims Ted's Dashboard on a nightly schedule — darkening the background,
lowering the screen brightness, and switching to a night font color — then smoothly restores
your daytime values in the morning. It's configured entirely from **Settings → General → Automatic
night mode** and runs automatically on every view (no per-view configuration).

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend) integration**
> (v1.0.50+) and **Ted's Cards** v1.0.232+. The settings live in the backend store, and the feature
> runs on the invisible **Background** card that Ted's Dashboard already includes on every view
> (with `backend_integration: true`).

---

## What it does

At night, over your configured **transition duration**, it:

1. **Dims the background** to the **Dim brightness (background)** level (a dark overlay on the
   wallpaper — the wallpaper itself is never changed). This stacks on top of the base
   [Background brightness](#background-brightness) that applies during the day.
2. **Lowers the screen brightness** to your **Dim brightness (screen)** target (see
   [Screen brightness target](#screen-brightness-target)).
3. **Switches the font color** dashboard-wide to your **Night font color**.
4. **Switches the device to Dark mode** (optional) a few seconds after the transition finishes —
   restoring your Auto/Light/Dark setting in the morning. See [Dark mode](#dark-mode).

In the morning it reverses all three back to their daytime values. See
[How the schedule works](#how-the-schedule-works) for the exact timing rules.

---

## Where to find it

**Settings → General → Automatic night mode** — a collapsible panel just below **Icon set**, with an
**Enabled / Disabled** badge showing its current state.

The settings are **global with a per-device override**: set them once under **Global** and every device
follows, or open the **This device** tab and override any of them (e.g. a different brightness entity,
or disabling night mode on one screen). Use the panel's **Reset** button on the This-device tab to clear
that device's overrides and go back to inheriting Global.

---

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| **Enabled** | `On` | Master switch for the schedule. Turning it **off** during the night restores your daytime values over a quick 10 seconds. |
| **Night start time** | `9:00 pm` | When night mode begins. |
| **Night end time** | `7:00 am` | When night mode ends and daytime values are restored. |
| **Dim brightness (screen)** | `75%` | Target brightness level for the entire screen. |
| **Dim brightness (background)** | `25%` | Independent target brightness level for the background; stacks with the screen brightness. |
| **Night font color** | `red` | The font color used dashboard-wide at night. Accepts a theme color name (`red`, `accent`, …) or any CSS color. |
| **Transition duration** | `30 s` | How long the fade into (and out of) night mode takes. |
| **Switch to Dark mode** | `On` | Store this device's Auto/Light/Dark setting and switch to Dark at night (see [Dark mode](#dark-mode)). Needs browser_mod. |
| **Screen brightness entity** | *(auto)* | *(This-device)* The entity that controls this screen's brightness. Leave empty to auto-use the device's browser_mod screen light. See below. |

The night window may span midnight (e.g. `9:00 pm → 7:00 am`) or fall within a single day
(e.g. `1:00 pm → 2:00 pm`, useful for testing).

### Background brightness

Separate from night mode, **Settings → General → Background Wallpaper** has a **Background
brightness** slider (default **75%**) that dims the wallpaper at **all** times. Night mode's
**Dim brightness (background)** is the night-time target the background transitions *to*; in the
morning it returns to this base Background brightness.

---

## Screen brightness target

A browser can't change a device's hardware backlight directly, so night mode drives an **entity** that
represents the screen's brightness. Supported entity types:

- **`light`** — set via `light.turn_on` with `brightness_pct`. The recommended target is the
  per-browser **screen light** that [browser_mod](https://github.com/thomasloven/hass-browser_mod)
  registers, which dims the screen with a dark overlay. When the **Screen brightness entity** field is
  left empty, night mode **auto-resolves** this device's browser_mod screen light.
- **`number`** / **`input_number`** — set via `set_value`, mapping the Dim brightness percent onto the
  entity's `min`…`max` range. Useful for kiosk apps (e.g. Fully Kiosk) that expose brightness as a
  number entity.

Because the brightness entity is specific to each physical screen, set it on the **This device** tab.
If no entity is configured and no browser_mod screen light is found, the brightness step is skipped
(the background dim and font color still apply).

---

## How the schedule works

Night mode re-checks the clock every 30 seconds and re-evaluates whenever you change a setting.

**Entering night** — when the time reaches **Night start**, *or* when a page loads and the current time
is already inside the night window:

- The current daytime screen values are **snapshotted and saved** (see
  [Day-value storage & restore](#day-value-storage--restore)).
- The background dim, screen brightness, and font color transition to their night values over the
  **Transition duration**.

**Leaving night** — when the time reaches **Night end**, *or* on load when the time is outside the
window:

- All three effects transition **back** to the stored daytime values.

**Toggling Enabled off** during the night immediately begins restoring — over a fixed **10 seconds**
rather than the full transition duration.

---

## Day-value storage & restore

So it can put things back exactly, night mode stores your daytime screen state **per device, in the
backend** (the internal `night_day_snapshot` setting). Because it lives in the backend — not the
browser — it survives clearing your browser cache, and a page reload during the night keeps the *true*
daytime value instead of re-capturing the already-dimmed one.

What's captured for the brightness entity:

- **Brightness** level.
- For **`light`** entities also the **color temperature** and **on/off** state — so a light that was a
  warm white (or off) during the day is restored to exactly that in the morning.

The background dim and font color need no stored values: night mode simply layers on top (an overlay
plus a color override), so removing those layers restores the original wallpaper and theme colors
exactly.

Restore happens on **all** exit paths: the natural morning end, and manually turning **Enabled** off.

---

## Transitions & fading

- **Background dim** and **screen brightness** fade smoothly over the duration (both are stepped in the
  browser, so they work even for the browser_mod screen light, which ignores the native `transition`
  parameter). The background dim and the screen dim are separate overlays, so they **stack** — the
  background ends up darker than the rest of the screen at night.
- **Font color** cross-fades smoothly over the duration. Ted's own cards recolor via an overridable
  `--ted-night-text` theme token (so it works in both the `ted-style` and `ha` themes), and native Home
  Assistant cards recolor via the standard `--primary-text-color`.

---

## Dark mode

With **Switch to Dark mode** on, night mode also flips this device to **Dark** theme mode. It:

- **Stores** the device's current **Auto / Light / Dark** setting (and theme name) in the day snapshot;
- **Switches to Dark** 5 seconds *after* the night transition finishes;
- **Restores** your stored setting exactly at **Night end** (or when you turn night mode off).

This uses [browser_mod](https://github.com/thomasloven/hass-browser_mod)'s `set_theme` (targeted at this
browser only), so it's per-device and needs browser_mod installed. It keeps your current theme — only the
Auto/Light/Dark mode changes.

## Requirements

| Requirement | Why |
| --- | --- |
| **Ted's Cards Backend** v1.0.50+ | Stores the night settings and the per-device day snapshot. |
| **Ted's Cards** v1.0.232+ | The night-mode engine + Settings panel. |
| Background card with `backend_integration: true` | The engine runs on the invisible Background card. Ted's Dashboard already includes it on every view. |
| [browser_mod](https://github.com/thomasloven/hass-browser_mod) *(optional)* | Provides the auto-resolved per-device **screen light** used to dim the display, and the per-device **Dark mode** switching. Not required if you point **Screen brightness entity** at your own `light`/`number` entity and leave **Switch to Dark mode** off. |

---

## Troubleshooting

- **Brightness doesn't change** — set a **Screen brightness entity** on the **This device** tab. If you
  rely on the auto browser_mod screen light, make sure browser_mod is installed and this browser is
  *registered* in its panel (the panel hint shows the resolved entity when found).
- **Nothing happens at all** — confirm the backend is installed and the Settings panel loads, that
  **Enabled** is on, and that the current time falls inside your Night start/end window.
- **Font color doesn't apply to some cards** — Ted's own cards are recolored via `--ted-style-text`;
  third-party cards that hardcode their text color may not follow the night color.
- **Testing** — set a short window (e.g. start one minute ahead) and a short **Transition duration**
  so you don't have to wait to see the fade.
