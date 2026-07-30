/**
 * Voice controller — glue between the browser voice engine, the overlay toast, and
 * the full-screen Assist-Response view.
 *
 * Responsibilities:
 *  - feed `hass` into the shared {@link voicePipeline};
 *  - drive the compact {@link voiceOverlay} through a run (listening → speech → answer);
 *  - on devices that prefer full-screen (nightstand/handheld), route the final answer
 *    to the Assist-Response view via the existing `teds_dashboard_system.assist_response`
 *    service (which pushes + navigates), instead of the toast;
 *  - expose {@link startPushToTalk} for the navbar mic button;
 *  - keep the navbar host re-rendering so the mic icon reflects the live state.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant } from "custom-card-helpers";

import { voicePipeline, isVoiceSupported, type VoiceSnapshot } from "./voice-pipeline";
import { voiceOverlay, type VoiceOverlayView, type VoiceTurn } from "./assist-overlay";
import { settingsStore } from "./settings";
import { resolveDeviceId } from "./device-id";
import { resolveDeviceHaId } from "./device-area";
import { asDeviceType, DEVICE_TYPE_PRESETS } from "./device-types";

const DOMAIN = "teds_dashboard_system";

/** State → accent color (matches the messagebox severity palette). */
const ACCENT: Record<string, string> = {
  wake: "#8a93a6",
  listening: "#4cc2ff",
  thinking: "#ffb454",
  responding: "#6ccb5f",
  error: "#ff99a4",
};

/** State → mic/status icon. */
const ICON: Record<string, string> = {
  wake: "mdi:microphone-question",
  listening: "mdi:microphone",
  thinking: "mdi:dots-horizontal",
  responding: "mdi:message-reply-text",
  error: "mdi:microphone-off",
};

/** True when this device should show the full-screen Assist-Response view for answers
 *  (a device-scoped `fullscreen_default` override wins over the device-type preset). */
function prefersFullscreen(): boolean {
  const explicit = settingsStore.deviceSettings().fullscreen_default;
  if (typeof explicit === "boolean") return explicit;
  const dt = asDeviceType(settingsStore.effective().device_type);
  return dt ? DEVICE_TYPE_PRESETS[dt].fullscreen_default : false;
}

/** The configured pipeline id (empty = Home Assistant's preferred). */
function configuredPipeline(): string | undefined {
  const v = settingsStore.effective().voice_pipeline;
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Module singleton that owns the engine↔overlay wiring. Subscribes to the pipeline
 * once and reacts to every state change.
 */
class VoiceManager {
  private _hass?: HomeAssistant;
  private _subbed = false;
  private _wasActive = false;
  private _answerRouted = false;
  private _lingerTimer?: number;
  private _redraw = new Set<() => void>();
  /** The running conversation transcript shown in the single overlay box. */
  private _turns: VoiceTurn[] = [];
  private _conversationActive = false;
  private _lastStt?: string;
  /** Continuous wake word wanted (from settings) + a user gesture has unlocked audio. */
  private _wakeEnabled = false;
  private _gestured = false;
  private _wakeTimer?: number;

  constructor() {
    // Autoplay + AudioContext both need a prior user gesture; unlock on the first tap
    // so continuous wake word (and its TTS) can run without an explicit mic press.
    if (typeof window !== "undefined") {
      window.addEventListener(
        "pointerdown",
        () => {
          this._gestured = true;
          this._refreshWake();
        },
        { once: true, capture: true },
      );
    }
  }

  setHass(hass: HomeAssistant | undefined): void {
    this._hass = hass;
    voicePipeline.setHass(hass);
    this._ensureSub();
    this._refreshWake();
  }

  /** Register a callback fired on every state change (navbar icon re-render). */
  onChange(cb: () => void): () => void {
    this._redraw.add(cb);
    return () => this._redraw.delete(cb);
  }

  /** Begin a push-to-talk run (from a user gesture). */
  startPushToTalk(hass?: HomeAssistant): void {
    if (hass) this.setHass(hass);
    this._ensureSub();
    const s = voicePipeline.snapshot;
    if (s.active) {
      // Interrupt a waiting wake-word run to talk now; a second tap cancels a PTT run.
      voicePipeline.stop();
      if (s.stage !== "wake_word") return;
    }
    void voicePipeline.start({
      stage: "stt",
      pipelineId: configuredPipeline(),
      deviceId: this._deviceId(),
      conversationId: voicePipeline.conversationId,
    });
  }

  /** Enable/disable continuous wake-word listening (from settings). */
  setWakeEnabled(enabled: boolean): void {
    if (enabled === this._wakeEnabled) return;
    this._wakeEnabled = enabled;
    if (enabled) {
      this._ensureSub();
      this._refreshWake();
    } else {
      this._clearWakeTimer();
      // Stop an idle wake-word run; leave an in-progress conversation alone.
      const s = voicePipeline.snapshot;
      if (s.active && s.stage === "wake_word" && s.state === "wake") voicePipeline.stop();
    }
  }

  /** Start (or restart) the wake-word loop when wanted, unlocked, and idle. */
  private _refreshWake(): void {
    if (!this._wakeEnabled || !this._gestured) return;
    if (!this._hass || !isVoiceSupported()) return;
    if (voicePipeline.active) return;
    void voicePipeline.start({
      stage: "wake_word",
      pipelineId: configuredPipeline(),
      deviceId: this._deviceId(),
      conversationId: voicePipeline.conversationId,
    });
  }

  /** The HA device id for this panel (browser_mod dashboard device), for area/device intents. */
  private _deviceId(): string | undefined {
    return resolveDeviceHaId(this._hass);
  }

  private _scheduleWake(): void {
    this._clearWakeTimer();
    // Small gap so a finished run releases the mic before the next wake cycle opens it.
    this._wakeTimer = window.setTimeout(() => {
      this._wakeTimer = undefined;
      this._refreshWake();
    }, 450);
  }

  private _clearWakeTimer(): void {
    if (this._wakeTimer) {
      window.clearTimeout(this._wakeTimer);
      this._wakeTimer = undefined;
    }
  }

  private _ensureSub(): void {
    if (this._subbed) return;
    this._subbed = true;
    voicePipeline.subscribe((s) => this._onSnap(s));
  }

  private _onSnap(s: VoiceSnapshot): void {
    if (s.active && !this._wasActive) {
      // New run — reset per-run routing; start a fresh transcript unless we're
      // continuing an open conversation (a quick follow-up).
      this._answerRouted = false;
      this._clearLinger();
      if (!this._conversationActive) {
        this._turns = [];
        this._lastStt = undefined;
        this._conversationActive = true;
      }
    }
    this._wasActive = s.active;
    const fs = prefersFullscreen();

    // Append the recognized user speech as a turn (once per utterance).
    if (s.sttText && s.sttText !== this._lastStt) {
      this._lastStt = s.sttText;
      this._turns.push({ role: "user", text: s.sttText });
    }
    // Append the assistant answer once + reflect it onto the Assist-Response view.
    if (s.answer && !this._answerRouted) {
      this._answerRouted = true;
      this._turns.push({ role: "assistant", text: s.answer });
      this._pushResponse(s.answer, fs);
    }

    if (fs && this._answerRouted) {
      // The full-screen Assist-Response view owns the answer on these devices; the
      // compact overlay still shows during listening/thinking (before the answer lands).
      voiceOverlay.hide();
    } else {
      const view = this._viewFor(s);
      if (view) voiceOverlay.show(view);
      else voiceOverlay.hide();
    }

    // Clear only once the run has finished AND the spoken answer has stopped playing,
    // so a long response stays on screen a little past the end of the TTS.
    if (!s.active && !s.ttsActive) {
      if (s.state === "error") this._endConversation(2600);
      else if (fs && this._answerRouted) this._endConversation(0);
      else if (this._turns.length) this._endConversation(3500);
      else this._endConversation(0);
      // Resume the wake-word loop after any run ends (PTT or a completed conversation).
      if (this._wakeEnabled) this._scheduleWake();
    }

    for (const cb of this._redraw) cb();
  }

  /** Build the overlay view (transcript + live status), or null when nothing shows. */
  private _viewFor(s: VoiceSnapshot): VoiceOverlayView | null {
    const turns = this._turns;
    switch (s.state) {
      case "wake":
        return { turns, status: "Say the wake word…", icon: ICON.wake, accent: ACCENT.wake, pulsing: true };
      case "listening":
        return { turns, status: "Listening…", icon: ICON.listening, accent: ACCENT.listening, pulsing: true };
      case "thinking":
        return { turns, status: "Thinking…", icon: ICON.thinking, accent: ACCENT.thinking };
      case "responding":
        return { turns, icon: ICON.responding, accent: ACCENT.responding };
      case "error":
        return { turns, status: s.error || "Voice error", icon: ICON.error, accent: ACCENT.error };
      case "idle":
        return turns.length ? { turns, icon: ICON.responding, accent: ACCENT.responding } : null;
    }
  }

  /** Reflect the answer onto the Assist-Response view (targets this device precisely).
   *  Full-screen devices navigate there; compact devices update it silently so a manual
   *  visit shows the latest answer. */
  private _pushResponse(answer: string, fullscreen: boolean): void {
    try {
      this._hass?.callService?.(DOMAIN, "assist_response", {
        message: answer,
        devices: [resolveDeviceId()],
        navigate: fullscreen,
      });
    } catch {
      /* the overlay still shows the answer */
    }
  }

  /** Dismiss the overlay after `ms` and end the conversation thread. */
  private _endConversation(ms: number): void {
    this._clearLinger();
    const finish = (): void => {
      this._lingerTimer = undefined;
      voiceOverlay.hide();
      this._turns = [];
      this._lastStt = undefined;
      this._conversationActive = false;
      voicePipeline.resetConversation();
    };
    if (ms <= 0) finish();
    else this._lingerTimer = window.setTimeout(finish, ms);
  }

  private _clearLinger(): void {
    if (this._lingerTimer) {
      window.clearTimeout(this._lingerTimer);
      this._lingerTimer = undefined;
    }
  }
}

/** Shared singleton. */
export const voiceManager = new VoiceManager();

/** Start a push-to-talk run (called by the navbar mic status item). */
export function startPushToTalk(hass?: HomeAssistant): void {
  voiceManager.startPushToTalk(hass);
}

type VoiceHost = ReactiveControllerHost & { hass?: HomeAssistant };

/**
 * Attach to a long-lived host (the navbar): feeds `hass` to the voice engine and
 * re-renders the host whenever the voice state changes (so the mic icon updates).
 */
export class VoiceController implements ReactiveController {
  private _unsub?: () => void;
  private _unsubSettings?: () => void;

  constructor(
    private _host: VoiceHost,
    private _enabled?: () => boolean,
  ) {
    _host.addController(this);
  }

  hostConnected(): void {
    this._unsub = voiceManager.onChange(() => this._host.requestUpdate());
    this._unsubSettings = settingsStore.subscribe(() => this._syncWake());
    this._feed();
    this._syncWake();
  }

  hostUpdated(): void {
    this._feed();
    this._syncWake();
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
    this._unsubSettings?.();
    this._unsubSettings = undefined;
    voiceManager.setWakeEnabled(false);
  }

  private _feed(): void {
    if (this._enabled && !this._enabled()) return;
    voiceManager.setHass(this._host.hass);
  }

  private _syncWake(): void {
    const on =
      (!this._enabled || this._enabled()) &&
      settingsStore.effective().continuous_wakeword_enabled === true;
    voiceManager.setWakeEnabled(on);
  }
}
