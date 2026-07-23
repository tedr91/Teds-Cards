# Ted's Announce Card

`type: custom:ted-announce-card`

A **broadcast composer**: pick who hears it, choose a ready-made or custom message,
and send a spoken announcement to your Ted's Dashboard devices. Announcements are
spoken aloud (text-to-speech) on each target's speaker and appear as a **large,
centered toast** on the targeted screens.

> **Requires the [Ted's Cards Backend](https://github.com/tedr91/Teds-Cards-Backend)
> integration.** Without it the card shows: *"Install the Ted's Cards Backend
> integration to send announcements."*

---

## What it does

- **Compose** an announcement from the global **predefined message list** (managed
  in Settings → Announce) or type a **custom** one-off message.
- **Target** any combination of **areas** (rooms) and **individual registered
  devices**. Selecting nothing sends it **house-wide** to every present device.
- Choose **Play once** (auto-dismisses after a timeout) or **Until dismissed**
  (stays on screen until someone clears it).
- For persistent announcements, optionally **repeat an alert chime** after the
  spoken message so it keeps drawing attention.
- **Recent** list: quick-**send again**, **load** a past announcement back into the
  composer, or **remove** it.

Each target speaker uses the best method for its capability: Music Assistant / Sonos
/ Alexa-style **announce-capable** players duck the current audio and auto-resume;
other players play the speech directly. The spoken voice uses the TTS engine set in
**Settings → Announce → Voice** (or Home Assistant's default).

---

## Minimal example

```yaml
type: custom:ted-announce-card
```

With the backend installed this shows the composer, your predefined messages, the
available areas/devices, and the Recent list.

## Themed, deep-linked settings

```yaml
type: custom:ted-announce-card
title: Broadcast
theme: ted-style
settings_path: "[root]/settings?tab=announce"
```

---

## Configuration

### Content

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | `Announce` | Header text. |
| `settings_path` | string | `[root]/settings?tab=announce` | Where the header cog navigates to manage the predefined message list. `[root]` is replaced with the effective `dashboard_root`. |

### Appearance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `ha` \| `ted-style` | `ha` | `ted-style` adds a frosted, translucent surface. |
| `background` | color | *(theme)* | Card background override (hex/rgb/hsl/var or a theme color name). |
| `transparency` | number | — | Surface transparency (0–100). |
| `blur` | number | — | Backdrop blur (0–100). |
| `brushed` | boolean | `false` | Brushed-metal overlay. |
| `shadow` | boolean | `true` | Card shadow. |
| `scale` | number | `100` | Overall card scale (50–200%). |

### Header

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show_header_icon` | boolean | `true` | Show the header icon. |
| `header_icon_size` | number | `100` | Header icon size (10–400%). |
| `show_header_name` | boolean | `true` | Show the header title. |
| `header_name_size` | number | `100` | Header title size (10–400%). |
| `header_divider` | boolean | `false` | Divider line under the header. |

---

## Predefined messages & global settings

The **predefined message list** and announcement defaults live in **Settings →
Announce** (global, admin-editable):

| Setting | Description |
| --- | --- |
| **Predefined messages** | The list of ready-made announcements ({label, spoken text, icon}) shown as chips in the composer. |
| **Voice (TTS engine)** | The `tts.*` engine used to speak announcements. Empty = Home Assistant's default. |
| **Announcement volume** | Volume (0–100%) for the speech and alert chime. |
| **Alert chime** | Sound looped after the spoken message on persistent announcements. |
| **Repeat chime by default** | Default for the "repeat alert sound" toggle. |
| **One-shot timeout** | How long a *Play once* announcement stays before auto-dismissing. |

---

## Targeting

- **Areas** target every **present** Ted's Dashboard device whose registered area
  matches.
- **Devices** target specific registered browsers/screens by their Ted's Cards
  device id (the same devices that appear on the *This device* Settings tab).
- Selecting **nothing** is **house-wide** — every present device.
- Devices in **Do Not Disturb** are skipped.

The prominent toast is shown only on the targeted screens; the speech plays only on
their speakers.
