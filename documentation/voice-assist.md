# Voice Assist (browser satellite)

Ted's Dashboard System can turn a display device (wall panel, nightstand tablet,
Echo Show, …) into its **own** Assist voice satellite, running the Home Assistant
Assist pipeline **inside the dashboard** and showing its **own** voice UI.

This replaces the Home Assistant Companion app's built-in Assist dialog, which draws
its own full-screen overlay that stays open until you tap it. Because that dialog is
owned by the app (outside the dashboard), TDS can't close it. By running the pipeline
in the dashboard instead, TDS controls the whole experience — the voice overlay
appears when you speak and **dismisses itself** as soon as the answer finishes.

There are two ways to trigger it:

- **Push-to-talk** — a microphone button in the navbar (by default at the left, next to
  the weather item). Tap it, speak, and the overlay shows what you said and the answer.
  On by default. You can move it to any section in **Settings → Navbar**.
- **Continuous wake word (experimental)** — the device listens for your wake word
  hands-free. Off by default; see [the setting](#settings) below.

Both share one browser engine: it captures the microphone, streams audio to your
Assist pipeline, plays the spoken response through the device's speaker, and shows
the result.

---

## Requirement: the page must be served over HTTPS

> **This is the single most important requirement.** Voice will not work without it.

Browsers only allow microphone access (`getUserMedia`) in a **secure context** —
that means the dashboard must be loaded over **`https://`** (or `http://localhost`).
A panel loaded over plain `http://<ip-or-hostname>:8123` on your LAN is **not** a
secure context, so the microphone API is unavailable and both push-to-talk and the
wake word are blocked. No app permission or setting can override this — it is a
browser-level security rule.

You have two ways to satisfy it.

### Option B — quickest: use your Home Assistant Cloud (Nabu Casa) URL

If you have a Home Assistant Cloud subscription, its remote URL is already HTTPS.
Point the panel at it and voice works immediately.

1. In the Home Assistant Companion app on the device, open **Settings → Companion
   app → Servers** (or re-onboard the server) and set the URL the app loads to your
   **Nabu Casa remote URL** (`https://<your-id>.ui.nabu.casa`).
2. Reload the dashboard. Confirm the address bar / server URL is `https://…`.

Trade-off: the panel's traffic (including the audio stream) now routes through the
cloud rather than staying on your LAN, so there's a little added latency and it
depends on your internet connection. Great for trying it out; for always-on panels,
prefer Option A below.

### Option A — recommended: local HTTPS with a trusted certificate

This keeps everything on your LAN **and** secure. The goal is to load the dashboard
from a local `https://` address with a certificate your device trusts (so there's no
warning). Pick one of these:

**A1. Reverse proxy add-on (simplest self-hosted).** Install a TLS-terminating proxy
in front of Home Assistant:

- The **NGINX Home Assistant SSL proxy** add-on, or
- **Caddy** / **Traefik** (as an add-on or on another host).

Point it at a local hostname and let it obtain a certificate (see A3 for a trusted
cert). Then load panels from `https://<your-host>`.

**A2. Direct TLS in Home Assistant.** Add a certificate to `configuration.yaml`:

```yaml
http:
  ssl_certificate: /ssl/fullchain.pem
  ssl_key: /ssl/privkey.pem
```

Restart Home Assistant and load panels over `https://<host>:8123`.

**A3. Get a trusted certificate (avoids browser warnings).** A self-signed
certificate technically enables a secure context, but many device WebViews still
show a warning or refuse it — so use a **real** certificate. The easiest local
approach is a certificate for a domain you own via a **DNS challenge** (no port
forwarding needed):

- The **Let's Encrypt** or **DuckDNS** add-on can issue a certificate for a
  hostname like `home.yourdomain.com` using DNS validation.
- Point that hostname at Home Assistant's **local** IP (split-horizon DNS, or a
  local DNS override) so the name resolves on your LAN but the certificate is fully
  trusted.

Then set the Companion app / panels to load `https://home.yourdomain.com`.

### Verify the secure context

On the device, open the dashboard and check that the URL starts with `https://`
(or is `localhost`). If push-to-talk reports **"Microphone requires HTTPS"**, the
page is still on an insecure origin — revisit the steps above.

---

## Turn off the Companion app's own Assist (so it doesn't double-trigger)

So the app's native dialog never appears alongside the TDS overlay, disable the
Companion app's Assist on each panel:

1. Home Assistant Companion app → **Settings → Companion app → Assistant / Assist**.
2. Turn off the on-device **wake word** and the app-level Assist for that device.

Now the wake word / mic button in the dashboard is the only voice entry point.

---

## Settings

Under **Settings → Voice** (Ted's Settings card):

| Setting | Default | What it does |
| --- | --- | --- |
| **Show push-to-talk mic button** | On | Shows the microphone button in the navbar that starts an Assist request on tap. |
| **Enable continuous wake word (experimental)** | **Off** | Listens continuously for the wake word using the browser microphone. Uses more CPU/battery, needs HTTPS, and the browser must stay in the foreground. |
| **Assist pipeline** (Advanced) | preferred | The Assist pipeline id to use on this device. Leave blank to use Home Assistant's preferred pipeline. |

Notes for continuous wake word:

- It only starts after you've **tapped the screen once** (browsers require a user
  gesture before a page may open the microphone and play audio).
- The device must keep the dashboard **in the foreground**; a backgrounded WebView
  is throttled and stops listening.

---

## How the answer is shown

The overlay adapts to the device using its **device type's "fullscreen default"**
(Settings → General → Device type):

- **Nightstand / Handheld** (fullscreen by default): the answer opens the full-screen
  **Assist-Response** view.
- **Wall panels** (compact by default): the answer appears as a small message
  toast over the current view, then dismisses itself.

During a request the overlay shows the live state — *Listening…*, then what you
said, then *Transcribing…*, *Thinking…*, named tool activity, streamed response
text, and the spoken answer — using the same look as the
[Assist-Response card](./assist-response-card.md). The spoken response plays through
the device's own speaker. The full-screen Assist-Response view keeps a scroll-back
history of the conversation, so a long answer can be scrolled through.

While listening, a fixed 10-bar colorful waveform responds to microphone input.
Reduced-motion mode keeps the level information but removes decorative transitions
and glow animation.

Weather and Entity Card tool results receive richer visual treatment:

- **Weather** shows current conditions when available and responsive forecast rows.
- **Entity Card** shows the Lovelace card returned by the conversation tool as a
  read-only preview. Its controls cannot be activated from the voice result.

Rich results remain visible for 30 seconds after the response finishes. Pointer,
touch, wheel, or keyboard interaction with the result restarts that timer. Compact
results then dismiss; fullscreen results return to the exact view that was open
before Assist navigated away. Manual navigation is never overridden by a stale
voice-return timer.

This prior-view behavior is intentionally limited to temporary voice results. The
broader **Auto-return home after** setting still needs a unified TDS idle/navigation
policy covering temporary views, Home fallback, route exclusions, and competing
timers.

---

## Interrupting a long answer

While the assistant is speaking you can cut it off:

- **Say a stop word** — "stop", "shut up", "quit", "no", "cancel", "enough", etc.
  TDS keeps listening during playback and stops the answer as soon as it hears one
  (then it just acknowledges with "Okay"). Barge-in needs the device's microphone,
  so it only works over HTTPS.
- **Tap the mic button** — while an answer is speaking the navbar mic turns into a
  **stop** button; tapping it cuts the answer off immediately.

---

## Keep answers short and to the point

The length of a spoken answer is decided by your **conversation agent** (e.g. the
OpenAI/LLM agent in Settings → Voice assistants), not by TDS. LLM agents love to
give long, thorough paragraphs — which is painful to *listen* to. Add an
instruction to your agent's prompt so answers stay brief. For example:

> You are a voice assistant for a home. Keep spoken answers **short and to the
> point** — usually one or two sentences. Lead with the key information the user
> asked for, use natural spoken phrasing (no markdown, lists, or URLs), and only add
> detail if the user explicitly asks for more.

For weather specifically, something like *"Give tomorrow's forecast in one short
sentence — the condition and the high/low"* keeps it tight.

This makes every answer quicker to hear (and quicker to read on the Assist-Response
view), and pairs well with the stop-word interruption above.

