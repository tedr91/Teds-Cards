# Assist-Response Card

`custom:ted-assist-response-card`

The visual counterpart to a spoken Assist answer — the Ted's Dashboard equivalent
of View Assist's "Info" view. A voice intent or automation pushes a **title +
message** (and optional background image) to one or more devices/areas; the card
displays it and the targeted screens automatically switch to the Assist-Response
view.

> Requires the **Ted's Cards Backend** integration.

## How it works

1. An automation / voice pipeline calls the `teds_cards_backend.assist_response`
   service with the answer text and a target (areas and/or devices).
2. The backend stores the latest answer per target and pushes it to the subscribed
   cards over a WebSocket stream. Each card shows the answer only if it targets
   **this** device (by device id, by area, or house-wide when no target is given).
3. Unless `navigate: false` is passed, the backend also navigates the targeted
   screens to the Assist-Response view (reusing the same per-device navigation
   signal as the rest of Ted's Cards).
4. The content stays until it's replaced — there is **no auto-revert timer** yet
   (a dashboard-wide "return home after idle" feature will cover that separately).

On load the card restores the current answer from `sensor.teds_assist_responses`,
so a reloaded or freshly-navigated screen shows the latest content immediately.

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | string | — | `custom:ted-assist-response-card` |
| `title` | string | `Assist` | Fallback title shown before the first answer (and when a pushed answer has no title). |
| `placeholder` | string | `Waiting for a response…` | Message shown before the first answer arrives. |
| `background_image` | string | — | Default background image URL, used when a pushed answer carries no image. |
| `fill` | boolean | `true` | Fill the content area. |
| `theme` | `ted-style` \| `ha` | `ted-style` | Card theme. |
| `background` | color | — | Optional background color override. |
| `transparency` | number (0–100) | — | Surface transparency. |
| `blur` | number (0–100) | — | Background blur. |

## The `assist_response` service

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `message` | string | yes | The answer text (main body). |
| `title` | string | no | Title shown at the top-left. |
| `image` | string | no | Background image URL for this answer. |
| `areas` | list of area ids | no | Target these areas. |
| `devices` | list of device ids | no | Target these devices (Ted device ids, e.g. `bm:…`). |
| `navigate` | boolean | no (default `true`) | Also switch the targeted screens to the view. |

Empty `areas` **and** `devices` = house-wide (shown on every device on the view;
house-wide never force-navigates every screen).

### Example automation

```yaml
# Speak the weather, and show the same text on the kitchen screen.
- alias: "Weather answer to screen"
  trigger:
    - platform: conversation
      command: ["what's the weather"]
  action:
    - service: teds_cards_backend.assist_response
      data:
        title: "Weather"
        message: "It's 72°F and sunny, with a high of 78°."
        areas:
          - kitchen
```
