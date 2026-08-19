# Automatic Night Mode

Automatic Night Mode applies independently enabled nighttime effects to Ted's Dashboard — dimming
the background or screen, hiding the wallpaper, shifting the font color, and selecting Dark mode —
then restores the configured daytime targets and theme preference in the morning. It's configured
entirely from **Settings → General → Dynamic night mode** and runs automatically on every view.

> **Requires the [Ted's Dashboard System](https://github.com/tedr91/Teds-Dashboard-System) integration**
> and **Ted's Cards**. The settings live in the backend store, and the feature
> runs on the invisible **Background** card that Ted's Dashboard already includes on every view
> (with `dashboard_integration: true`).

---

## What it does

At night, over your configured **transition duration**, it:

1. **Dims the background** to the **Dim brightness (background)** level (a dark overlay on the
   wallpaper — the wallpaper itself is never changed). This stacks on top of the base
   [Background brightness](#background-brightness) that applies during the day.
2. **Lowers the screen brightness** to your **Dim brightness (screen)** target (see
   [Screen brightness target](#screen-brightness-target)).
3. **Switches the font color** dashboard-wide to your **Night font color**.
4. **Switches the signed-in Home Assistant user to Dark mode** (optional) a few seconds after the transition finishes —
   restoring your Auto/Light/Dark setting in the morning. See [Dark mode](#dark-mode).

In the morning it reverses each enabled effect back to its daytime value. See
[How the schedule works](#how-the-schedule-works) for the exact timing rules.

---

## Where to find it

**Settings → General → Dynamic night mode**.

The settings are **global with a per-device override**: set them once under **Global** and every device
follows, or open the **This device** tab and override any of them (e.g. a different brightness entity,
or different enabled effects on one screen). Use each subsection's link control on the **This device**
tab to clear that device's overrides and go back to inheriting Global.

---

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| **Schedule** | `Sun: dusk → dawn` | Uses civil dusk/dawn, sunset/sunrise, or manual start/end times. Sun schedules fall back to the manual times when `sun.sun` data is unavailable. |
| **Transition duration** | `30 s` | How long the screen, background, and font fades take. |
| **Switch to Dark Mode** | `Off` | Save this HA user's Auto/Light/Dark preference, select Dark at night, and restore the exact preference at dawn. |
| **Auto-adjust screen brightness at night** | `Off` | Enables the configured day/night screen-brightness targets. |
| **Brightness (day/night)** | `100% / 75%` | Explicit daytime and nighttime screen targets. |
| **Auto-adjust background at night** | `Off` | Enables the configured day/night wallpaper-brightness targets. |
| **Brightness (day/night)** | `100% / 25%` | Explicit daytime and nighttime background targets. |
| **Hide background at night** | `Off` | Replaces the wallpaper with a calm solid gradient while it is night. |
| **Shift primary font color at night** | `Off` | Enables the dashboard-wide night font color. |
| **Night font color** | `red` | Accepts a theme color name (`red`, `accent`, …) or any CSS color. |
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

**Entering night** — when the selected Sun event/manual time occurs, *or* when a page loads and the current time
is already inside the night window:

- The background dim, screen brightness, and font color transition to their night values over the
  **Transition duration**.
- If Dark Mode is enabled, the signed-in user's exact Auto/Light/Dark preference is saved and Dark is
  selected five seconds after the visual transition finishes.

**Leaving night** — when the time reaches **Night end**, *or* on load when the time is outside the
window:

- Enabled visual effects transition to their explicit daytime targets, and the user's saved theme
  preference is restored.

Changing a setting while night mode is active applies that setting immediately without restarting the
scheduled transition.

---

## Day-value storage & restore

Screen and background brightness use the explicit **Brightness (day)** settings; they do not snapshot
the entity's current state. Font and wallpaper-hide effects are temporary layers, so removing them
restores the underlying theme colors and wallpaper. Only the Home Assistant theme-mode preference is
snapshotted because it is external user state that night mode temporarily changes.

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

With **Switch to Dark Mode** on, night mode changes Home Assistant's native, per-user theme preference. It:

- **Stores** the signed-in user's exact **Auto / Light / Dark** setting in a backend map keyed by HA user ID;
- **Switches to Dark** 5 seconds *after* the night transition finishes;
- **Restores** your stored setting exactly at **Night end** (or when you turn night mode off).

This fires Home Assistant's native `settheme` event, which HA persists for the user. It therefore
cascades to every session signed in as that account; the current theme name is preserved and only its
Auto/Light/Dark mode changes. Multiple HA users retain independent snapshots.

## Requirements

| Requirement | Why |
| --- | --- |
| **Ted's Dashboard System** | Stores the night settings and per-user theme preference snapshots. |
| **Ted's Cards** | The night-mode engine + Settings panel. |
| Background card with `dashboard_integration: true` | The engine runs on the invisible Background card. Ted's Dashboard already includes it on every view. |
| [browser_mod](https://github.com/thomasloven/hass-browser_mod) *(optional)* | Provides the auto-resolved per-device **screen light** used to dim the display. It is not required for native Dark Mode switching. |

---

## Troubleshooting

- **Brightness doesn't change** — set a **Screen brightness entity** on the **This device** tab. If you
  rely on the auto browser_mod screen light, make sure browser_mod is installed and this browser is
  *registered* in its panel (the panel hint shows the resolved entity when found).
- **Nothing happens at all** — confirm the backend is installed, at least one night effect is enabled,
  and the current time falls inside the selected Sun/manual night window.
- **Font color doesn't apply to some cards** — Ted's own cards are recolored via `--ted-style-text`;
  third-party cards that hardcode their text color may not follow the night color.
- **Testing** — set a short window (e.g. start one minute ahead) and a short **Transition duration**
  so you don't have to wait to see the fade.
