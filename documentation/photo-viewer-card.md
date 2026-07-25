# Ted's Photo Viewer Card

`type: custom:ted-photo-viewer-card`

Displays a **single photo** or a **folder album** of photos. When a photo is open you
can **Favorite** it, **Set it as your dashboard wallpaper**, and **Close** it. In album
mode you can page through photos (arrow-pills or the ←/→ keys) and run an auto-slideshow
with a crossfade. It's the card behind the content-only **Photos view**, but it also
works as a normal 12×5 tile embedded anywhere.

By default a photo opens contained (letterboxed) on a black stage; tap the image (or
hover) to reveal the action buttons in the top-right corner.

---

## Requirements

- **No backend** is required to show a photo or a media-folder album.
- **Ted's Cards Backend** (`teds_cards_backend`) is required for the extras — set
  `backend_integration: true` to enable:
  - the Settings-driven **album folder** (Settings → Photos → Album folder),
  - **Favorite** (copies the photo into the backend's `favorites` album), and
  - **Set as background** (stores the photo and switches this device's wallpaper to it).

---

## Minimal examples

A single image tile:

```yaml
type: custom:ted-photo-viewer-card
source: single
image: /local/photos/sunset.jpg
```

A folder album, driven by the Photos album setting (the Photos view setup):

```yaml
type: custom:ted-photo-viewer-card
source: album
fill: true
open_last_on_load: true
backend_integration: true
theme: ted-style
```

A folder album with an explicit media folder (no backend):

```yaml
type: custom:ted-photo-viewer-card
source: album
folder: media-source://media_source/local/Family Photos
```

---

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `single` \| `album` | `single` | Show one image, or browse a folder album. |
| `image` | string | — | Single mode: a URL, `media-source://` URI, or local HA path. |
| `folder` | string | — | Album mode: a `media-source://` folder URI. When omitted and `backend_integration` is on, the **Photos album folder** setting is used. |
| `album_source` | `folder` | `folder` | Album backend. Only Home Assistant media folders ship today. |
| `fit` | `contain` \| `cover` | `contain` | How the image sits in the frame. |
| `fill` | boolean | `false` | Fill the parent container (used by the content-only Photos view). |
| `open_last_on_load` | boolean | `false` | On load, re-open this device's last-viewed photo (else start empty). The Photos view sets this true. |
| `url_param` | string | `photo` | URL query param used to deep-link a photo (e.g. `?photo=sunset.jpg`). |
| `backend_integration` | boolean | `false` | Enable the Settings-driven folder, Favorite, and Set-as-background. |
| `settings_path` | string | — | Deep link for the empty-state **Settings** button. |
| `theme` | `ha` \| `ted-style` | `ha` | Theme for the empty-state surface + text. |
| `background` | color | — | Matte color behind the photo (the letterbox bars). Default black. |
| `transparency` | number (0–100) | — | Matte transparency — lets the dashboard wallpaper show through the letterbox bars. |
| `blur` | number (0–100) | — | Backdrop blur behind a translucent matte. |
| `empty_title` / `empty_message` | string | — | Override the "nothing open" placeholder text. |

---

## The Photos view

The Photos view is a content-only view that fills the screen with one Photo Viewer
card (`fill: true`). Navigating to it either re-opens the photo this device last
viewed or stays empty, controlled by **Settings → Photos → Re-open last photo**.

**Deep-linking:** append `?photo=<name-or-index>` to the Photos view URL to open a
specific album photo (matched by filename or position), e.g.
`/ted-dashboard/photos?photo=sunset.jpg`.

---

## Actions (when a photo is open)

- **Favorite** — copies the photo into the backend's `favorites` album (deduped by
  content). Favorited photos can be shown as a wallpaper **Slideshow → Favorites**
  album.
- **Set as background** — stores the photo on the backend (deduped), switches this
  device's wallpaper to **Single Image**, and selects it.
- **Close** — returns the viewer to its empty state (your last-viewed photo is kept).

In **album** mode (2+ photos) you also get:

- **Previous / Next** — the faint arrow-pills on each edge, or the **←/→** keys, page
  through the album (wrapping around the ends).
- **Slideshow** — the play button opens a duration popup (10s / 30s / 1m / 5m / 15m /
  30m / custom); the viewer then auto-advances until you press it again. Photos change
  with a **crossfade** (or instantly), per **Settings → Photos → Slideshow transition**
  and **Crossfade duration**.

Press **Escape** to close the open photo.

---

## Settings (Settings → Photos)

| Setting | Description |
| --- | --- |
| **Album folder** | The media folder shown on the Photos view (used when `backend_integration` is on). |
| **Re-open last photo** | When the Photos view loads, re-open this device's last-viewed photo. |
| **Slideshow transition** | Crossfade or none (used by the auto-slideshow). |
| **Crossfade duration** | Length of the crossfade between photos. |
