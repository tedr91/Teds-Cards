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
  /** True while the TTS answer audio is still playing in the browser. */
  ttsActive?: boolean;
  /** True on the emit where the user interrupted the spoken answer ("stop" / tap). */
  interrupted?: boolean;
}

export interface VoiceStartOptions {
  stage: VoiceStage;
  /** Explicit pipeline id; omit to use Home Assistant's preferred pipeline. */
  pipelineId?: string;
  /** wake_word only: seconds to wait for the wake word before the run ends. */
  wakeTimeout?: number;
  /** HA device id to attribute the request to (drives area scoping + device intents). */
  deviceId?: string;
  /** Conversation id to continue an existing conversation thread. */
  conversationId?: string;
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
    conversation_id?: string;
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

/** Utterances that cut off the spoken answer when heard during playback (barge-in). */
const STOP_PHRASES = new Set([
  "stop",
  "stop it",
  "shut up",
  "quit",
  "no",
  "nope",
  "cancel",
  "cancel it",
  "never mind",
  "nevermind",
  "be quiet",
  "enough",
  "silence",
  "shush",
]);

/** True when a short barge-in utterance is a request to stop the TTS. */
function isStopPhrase(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return false;
  if (STOP_PHRASES.has(t)) return true;
  const words = t.split(" ");
  return words.length <= 3 && words.some((w) => STOP_PHRASES.has(w));
}

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
  private _conversationId?: string;
  private _beeped = false;
  // Barge-in: a second, transcription-only capture that listens for a "stop" word
  // while the TTS answer is speaking, so the user can cut it off by voice.
  private _biStream?: MediaStream;
  private _biCtx?: AudioContext;
  private _biSource?: MediaStreamAudioSourceNode;
  private _biNode?: ScriptProcessorNode;
  private _biSink?: GainNode;
  private _biHandlerId: number | null = null;
  private _biUnsub?: () => void;
  private _biActive = false;

  public setHass(hass: HomeAssistant | undefined): void {
    this._hass = hass;
  }

  public get snapshot(): VoiceSnapshot {
    return this._snap;
  }

  public get active(): boolean {
    return this._snap.active;
  }

  /** The id of the current/last conversation (for threaded follow-ups). */
  public get conversationId(): string | undefined {
    return this._conversationId;
  }

  /** Forget the conversation thread so the next run starts fresh. */
  public resetConversation(): void {
    this._conversationId = undefined;
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
      if (opts.stage === "wake_word" && opts.wakeTimeout) input.timeout = opts.wakeTimeout;
      const sub: Record<string, unknown> = {
        type: "assist_pipeline/run",
        start_stage: opts.stage,
        end_stage: "tts",
        input,
      };
      if (opts.pipelineId) sub.pipeline = opts.pipelineId;
      if (opts.deviceId) sub.device_id = opts.deviceId;
      if (opts.conversationId) sub.conversation_id = opts.conversationId;

      this._handlerId = null;
      this._beeped = false;
      this._set({
        state: opts.stage === "wake_word" ? "wake" : "listening",
        active: true,
        stage: opts.stage,
        sttText: undefined,
        answer: undefined,
        answerTitle: undefined,
        error: undefined,
      });
      // Push-to-talk: we're listening immediately, so chime now (the tap is the gesture).
      if (opts.stage === "stt") this._beep();

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
    this._stopBargeIn();
    this._teardownCapture();
    if (this._snap.state !== "idle") this._set({ state: "idle", active: false });
  }

  /** Cut off the TTS answer if it's speaking (voice “stop” or a tap). Returns true if
   *  something was actually stopped. */
  public stopSpeaking(): boolean {
    const was = !!this._audio && this._snap.ttsActive === true;
    try {
      this._audio?.pause();
    } catch {
      /* ignore */
    }
    this._audio = undefined;
    this._stopBargeIn();
    if (this._snap.ttsActive) this._set({ ...this._snap, ttsActive: false, interrupted: true });
    return was;
  }

  // --- Barge-in (listen for "stop" during TTS) -------------------------------

  private async _startBargeIn(): Promise<void> {
    if (this._biActive || !this._hass?.connection || !isVoiceSupported()) return;
    this._biActive = true;
    try {
      this._biStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      this._biCtx = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      this._biSource = ctx.createMediaStreamSource(this._biStream);
      this._biNode = ctx.createScriptProcessor(4096, 1, 1);
      this._biSink = ctx.createGain();
      this._biSink.gain.value = 0;
      this._biNode.onaudioprocess = (e) => this._onBiAudio(e, ctx.sampleRate);
      this._biSource.connect(this._biNode);
      this._biNode.connect(this._biSink);
      this._biSink.connect(ctx.destination);
      this._biHandlerId = null;
      const conn = this._hass.connection as unknown as ConnLike;
      this._biUnsub = await conn.subscribeMessage<PipelineEvent>((ev) => this._onBiEvent(ev), {
        type: "assist_pipeline/run",
        start_stage: "stt",
        end_stage: "stt",
        input: { sample_rate: TARGET_RATE },
      });
    } catch {
      this._teardownBiCapture();
    }
  }

  private _onBiEvent(ev: PipelineEvent): void {
    if (ev.type === "run-start") {
      const id = ev.data?.runner_data?.stt_binary_handler_id;
      this._biHandlerId = typeof id === "number" ? id : null;
      return;
    }
    if (ev.type === "stt-end") {
      if (isStopPhrase(ev.data?.stt_output?.text ?? "")) this.stopSpeaking();
      return;
    }
    if (ev.type === "run-end" || ev.type === "error") {
      this._teardownBiCapture();
      // Keep listening for a later "stop" while the answer is still speaking.
      if (this._snap.ttsActive) window.setTimeout(() => void this._startBargeIn(), 250);
    }
  }

  private _onBiAudio(e: AudioProcessingEvent, srcRate: number): void {
    if (this._biHandlerId == null) return;
    const socket = (this._hass?.connection as unknown as ConnLike | undefined)?.socket;
    if (!socket || socket.readyState !== 1) return;
    const pcm = downsampleTo16k(e.inputBuffer.getChannelData(0), srcRate);
    if (!pcm.length) return;
    const frame = new Uint8Array(pcm.byteLength + 1);
    frame[0] = this._biHandlerId;
    frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
    try {
      socket.send(frame);
    } catch {
      /* socket may be mid-reconnect */
    }
  }

  private _teardownBiCapture(): void {
    this._biHandlerId = null;
    try {
      if (this._biNode) this._biNode.onaudioprocess = null;
      this._biNode?.disconnect();
      this._biSource?.disconnect();
      this._biSink?.disconnect();
    } catch {
      /* ignore */
    }
    this._biNode = undefined;
    this._biSource = undefined;
    this._biSink = undefined;
    this._biCtx?.close().catch(() => undefined);
    this._biCtx = undefined;
    this._biStream?.getTracks().forEach((t) => t.stop());
    this._biStream = undefined;
    this._biActive = false;
  }

  private _stopBargeIn(): void {
    this._biUnsub?.();
    this._biUnsub = undefined;
    this._teardownBiCapture();
  }

  // --- Pipeline events -------------------------------------------------------

  private _onEvent(ev: PipelineEvent): void {
    switch (ev.type) {
      case "run-start": {
        const id = ev.data?.runner_data?.stt_binary_handler_id;
        this._handlerId = typeof id === "number" ? id : null;
        if (ev.data?.conversation_id) this._conversationId = ev.data.conversation_id;
        break;
      }
      case "wake_word-end":
        // Wake word heard — the pipeline flows into speech capture; chime to confirm.
        this._beep();
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
      this._set({ ...this._snap, ttsActive: true });
      // Listen for a spoken "stop" (barge-in) while the answer plays.
      void this._startBargeIn();
      const done = () => {
        if (this._audio !== audio) return;
        this._stopBargeIn();
        this._set({ ...this._snap, ttsActive: false });
      };
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
      void audio.play().catch(() => done());
    } catch {
      // autoplay may be blocked without a gesture (continuous mode)
      this._set({ ...this._snap, ttsActive: false });
    }
  }

  /** Short rising chime to confirm the mic is listening. Uses the capture context. */
  private _beep(): void {
    if (this._beeped) return;
    this._beeped = true;
    const ctx = this._ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(990, now + 0.13);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      /* audio may be unavailable */
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
