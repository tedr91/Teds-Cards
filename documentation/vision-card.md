# Vision Card

`custom:ted-vision-card`

A timeline of AI-analyzed security-camera events. Each opted-in camera's detections
(motion / person / animal / vehicle) are captured and classified by Home Assistant's
native **AI Task** building block into a **severity**, a one-line **short summary**, a
detailed **long summary**, and a best-frame **thumbnail** (plus a short **clip** in clip
mode). Events stream into the card live and are also exposed as a calendar
(`calendar.teds_vision_timeline`) so you can ask Assist "what happened on the cameras".

No third-party vision integration is required — it runs entirely on Ted's Dashboard
System plus any AI provider that offers an AI Task entity with image-attachment support
(e.g. **OpenAI** or **Ollama**).

## Requirements

- Ted's Dashboard System integration installed (provides the backend engine, storage,
  websocket API, sensor, and calendar).
- An **AI Task** entity that supports attachments. Install an AI provider integration
  (OpenAI, Ollama, Google, Anthropic, …) and set it as your preferred AI Task entity in
  **Settings → Voice assistants**, or pick one explicitly in **Settings → Cameras →
  Vision Analysis**.
- Cameras that expose detection `binary_sensor`s (Frigate, Reolink, UniFi Protect, etc.).
  Cameras with no detection sensors can still be analyzed on demand via the
  `teds_dashboard_system.analyze_camera` service.

## Setup

1. **Settings → Cameras → Vision Analysis → Enable Vision Analysis** and pick an **AI Task
   entity** (or leave blank to use your preferred one).
2. In the **Cameras** list, expand a camera and turn on **Enable vision analysis**.
3. Add one or more **triggers** (what to trigger on): pick a **trigger type** (Motion,
   Person, Animal, …), a **severity level filter** (only act when the analyzed event is one
   of the selected severities), and a **cooldown**.
4. Under a trigger's **Additional actions**, add actions — **Toast notification**, **Push
   notification**, **Display live feed**, or a **Custom action** — each with its own settings.
5. Add the Vision view (or drop a `custom:ted-vision-card` on any dashboard) to see the timeline.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `ted-style` \| `ha` | `ted-style` | Card theme. |
| `cameras` | list | — | Only show events from these camera entity ids (unset = all). |
| `max_events` | number | `50` | Maximum events listed. |
| `settings_path` | string | `[root]/settings?tab=vision` | Deep-link used by the empty/onboarding CTA. |
| `empty_title` / `empty_message` | string | — | Override the empty-state text. |

## Severity levels

| Severity | Meaning |
| --- | --- |
| `critical` | Active threat, break-in, or emergency. |
| `suspicious` | Unexpected or concerning activity worth a human review. |
| `harmless` | Routine/expected activity (residents, pets, deliveries, passing cars). |
| `unknown` | Frames too unclear to judge. |

Each trigger has a **severity level filter** (a multi-select of the above). Its actions run
only when the analyzed event matches one of the selected severities; leave the filter empty
to act on every event.

## Capture modes (Settings → Cameras → Vision Analysis)

- **Clip** — grabs several frames across the capture window and stitches a short video
  (frames are analyzed; the clip is for viewing). Best context.
- **Burst** — rapid back-to-back snapshots.
- **Snapshot** — a single frame.

## Services

- `teds_dashboard_system.analyze_camera` — analyze a camera now (`camera_entity`,
  optional `event_type`). Useful for testing or cameras without detection sensors.
- `teds_dashboard_system.delete_vision_event` — remove one event (`id`).
- `teds_dashboard_system.clear_vision_events` — remove all events.
