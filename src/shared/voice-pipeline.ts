/**
 * Browser voice engine — runs the Home Assistant Assist pipeline directly from the
 * dashboard webview, so TDS owns the whole voice UX (no Companion-app native dialog).
 *
 * Shared by both triggers:
 *  - push-to-talk  → start("stt")        (single run per button press)
 *  - continuous WW → start("wake_word")  (loops; restarted by the VoiceController)
 *
 * Flow: capture the mic → downsample to 16 kHz PCM → stream as binary WebSocket frames
 * (each prefixed with the run's `stt_binary_handler_id`) → subscribe to `assist_pipeline/run`
 * events → surface state + live text to listeners → play the TTS response in-browser.
 *
 * SECURE CONTEXT: `navigator.mediaDevices.getUserMedia` only exists on https / localhost.
 * On a plain-http panel it is undefined and {@link isVoiceSupported} returns false.
 */
import type { HomeAssistant } from "custom-card-helpers";

/** Coarse pipeline state surfaced to the overlay. */
export type VoiceState =
  | "idle"
  | "wake" // waiting for the wake word (continuous mode only)
  | "listening" // mic open, capturing the user's speech
  | "thinking" // speech recognized, intent/LLM running
  | "responding" // TTS answer playing
  | "error";

export type VoiceStage = "wake_word" | "stt";

export interface VoiceSnapshot {
  state: VoiceState;
  /** True while a run is in progress (state !== "idle"). */
  active: boolean;
  /** Recognized user speech (set at stt-end). */
  sttText?: string;
  /** Assistant answer text (set at intent-end). */
  answer?: string;
  /** Optional answer title. */
  answerTitle?: string;
  /** Human-readable error, when state === "error". */
  error?: string;
  /** The stage the current/last run was started with. */
  stage?: VoiceStage;
}

export interface VoiceStartOptions {
  stage: VoiceStage;
  /** Explicit pipeline id; omit to use Home Assistant's preferred pipeline. */
  pipelineId?: string;
  /** wake_word only: seconds to wait for the wake word before the run ends. */
  wakeTimeout?: number;
}

type Listener = (snap: VoiceSnapshot) => void;

/** Minimal shape of the HA websocket connection we rely on. */
interface ConnLike {
  socket?: { readyState: number; send(data: ArrayBufferView): void } | null;
  subscribeMessage<T>(cb: (msg: T) => void, sub: Record<string, unknown>): Promise<() => void>;
}

/** A single Assist pipeline run event (loosely typed — we only read a few fields). */
interface PipelineEvent {
  type: string;
  data?: {
    runner_data?: { stt_binary_handler_id?: number | null };
    stt_output?: { text?: string };
    intent_output?: {
      response?: { speech?: { plain?: { speech?: string } } };
    };
    tts_output?: { url?: string };
    code?: string;
    message?: string;
  };
}

const TARGET_RATE = 16000;

/** True when the browser can capture the microphone (secure context + API present). */
export function isVoiceSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof AudioContext !== "undefined"
  );
}

/**
 * Singleton voice engine. Call {@link setHass} on every hass update, then {@link start}
 * from a user gesture (push-to-talk) or the wake-word controller.
 */
export class VoicePipeline {
  private _hass?: HomeAssistant;
  private _listeners = new Set<Listener>();
  private _snap: VoiceSnapshot = { state: "idle", active: false };

  private _unsub?: () => void;
  private _stream?: MediaStream;
  private _ctx?: AudioContext;
  private _source?: MediaStreamAudioSourceNode;
  private _node?: ScriptProcessorNode;
  private _sink?: GainNode;
  private _handlerId: number | null = null;
  private _audio?: HTMLAudioElement;
  private _starting = false;

  public setHass(hass: HomeAssistant | undefined): void {
    this._hass = hass;
  }

  public get snapshot(): VoiceSnapshot {
    return this._snap;
  }

  public get active(): boolean {
    return this._snap.active;
  }

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    listener(this._snap);
    return () => this._listeners.delete(listener);
  }

  /** Begin a pipeline run. No-op if a run is already active. */
  public async start(opts: VoiceStartOptions): Promise<void> {
    if (this._snap.active || this._starting) return;
    if (!this._hass?.connection) return;
    if (!isVoiceSupported()) {
      this._set({ state: "error", active: false, error: "Microphone requires HTTPS", stage: opts.stage });
      return;
    }
    this._starting = true;
    try {
      // 1) Open the microphone (throws if permission denied / insecure).
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      // 2) Build the capture graph (silent sink so we never echo the mic).
      const ctx = new AudioContext();
      this._ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      this._source = ctx.createMediaStreamSource(this._stream);
      this._node = ctx.createScriptProcessor(4096, 1, 1);
      this._sink = ctx.createGain();
      this._sink.gain.value = 0;
      this._node.onaudioprocess = (e) => this._onAudio(e, ctx.sampleRate);
      this._source.connect(this._node);
      this._node.connect(this._sink);
      this._sink.connect(ctx.destination);

      // 3) Subscribe to the pipeline run.
      const input: Record<string, unknown> = { sample_rate: TARGET_RATE };
      if (opts.stage === "wake_word") input.timeout = opts.wakeTimeout ?? 0;
      const sub: Record<string, unknown> = {
        type: "assist_pipeline/run",
        start_stage: opts.stage,
        end_stage: "tts",
        input,
      };
      if (opts.pipelineId) sub.pipeline = opts.pipelineId;

      this._handlerId = null;
      this._set({
        state: opts.stage === "wake_word" ? "wake" : "listening",
        active: true,
        stage: opts.stage,
        sttText: undefined,
        answer: undefined,
        answerTitle: undefined,
        error: undefined,
      });

      const conn = this._hass.connection as unknown as ConnLike;
      this._unsub = await conn.subscribeMessage<PipelineEvent>(
        (ev) => this._onEvent(ev),
        sub,
      );
    } catch (err) {
      const denied = (err as DOMException)?.name === "NotAllowedError";
      this._teardownCapture();
      this._set({
        state: "error",
        active: false,
        error: denied ? "Microphone permission denied" : "Couldn't start voice",
        stage: opts.stage,
      });
    } finally {
      this._starting = false;
    }
  }

  /** Stop the current run and release the microphone. */
  public stop(): void {
    this._unsub?.();
    this._unsub = undefined;
    this._teardownCapture();
    if (this._snap.state !== "idle") this._set({ state: "idle", active: false });
  }

  // --- Pipeline events -------------------------------------------------------

  private _onEvent(ev: PipelineEvent): void {
    switch (ev.type) {
      case "run-start": {
        const id = ev.data?.runner_data?.stt_binary_handler_id;
        this._handlerId = typeof id === "number" ? id : null;
        break;
      }
      case "wake_word-end":
        // Wake word heard — the pipeline flows into speech capture.
        this._set({ ...this._snap, state: "listening" });
        break;
      case "stt-start":
        this._set({ ...this._snap, state: "listening" });
        break;
      case "stt-end": {
        const text = ev.data?.stt_output?.text?.trim();
        this._set({ ...this._snap, state: "thinking", sttText: text || this._snap.sttText });
        break;
      }
      case "intent-end": {
        const speech = ev.data?.intent_output?.response?.speech?.plain?.speech?.trim();
        if (speech) this._set({ ...this._snap, answer: speech });
        break;
      }
      case "tts-end": {
        const url = ev.data?.tts_output?.url;
        this._set({ ...this._snap, state: "responding" });
        if (url) this._play(url);
        break;
      }
      case "run-end":
        // Stop streaming audio; keep any answer visible until the run resolves to idle.
        this._teardownCapture();
        this._set({ ...this._snap, state: "idle", active: false });
        break;
      case "error": {
        const code = ev.data?.code ?? "";
        this._teardownCapture();
        // A wake-word timeout is a normal end of a listening window, not an error.
        if (code.includes("wake_word") || code.includes("timeout")) {
          this._set({ ...this._snap, state: "idle", active: false });
        } else {
          this._set({
            ...this._snap,
            state: "error",
            active: false,
            error: ev.data?.message || "Voice error",
          });
        }
        break;
      }
    }
  }

  // --- Audio capture ---------------------------------------------------------

  private _onAudio(e: AudioProcessingEvent, srcRate: number): void {
    if (this._handlerId == null) return;
    const socket = (this._hass?.connection as unknown as ConnLike | undefined)?.socket;
    if (!socket || socket.readyState !== 1) return;
    const input = e.inputBuffer.getChannelData(0);
    const pcm = downsampleTo16k(input, srcRate);
    if (!pcm.length) return;
    const frame = new Uint8Array(pcm.byteLength + 1);
    frame[0] = this._handlerId;
    frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
    try {
      socket.send(frame);
    } catch {
      /* socket may be mid-reconnect */
    }
  }

  private _teardownCapture(): void {
    this._handlerId = null;
    try {
      if (this._node) this._node.onaudioprocess = null;
      this._node?.disconnect();
      this._source?.disconnect();
      this._sink?.disconnect();
    } catch {
      /* ignore */
    }
    this._node = undefined;
    this._source = undefined;
    this._sink = undefined;
    this._ctx?.close().catch(() => undefined);
    this._ctx = undefined;
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = undefined;
  }

  private _play(url: string): void {
    try {
      this._audio?.pause();
      const audio = new Audio(url);
      this._audio = audio;
      void audio.play().catch(() => undefined);
    } catch {
      /* autoplay may be blocked without a gesture (continuous mode) */
    }
  }

  private _set(snap: VoiceSnapshot): void {
    this._snap = snap;
    for (const l of this._listeners) l(snap);
  }
}

/** Linear-resample a Float32 frame to 16 kHz signed 16-bit PCM. */
function downsampleTo16k(input: Float32Array, srcRate: number): Int16Array {
  if (srcRate === TARGET_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = clampPcm(input[i]);
    return out;
  }
  const ratio = srcRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = clampPcm(input[Math.floor(i * ratio)]);
  }
  return out;
}

function clampPcm(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

/** Shared singleton engine. */
export const voicePipeline = new VoicePipeline();
