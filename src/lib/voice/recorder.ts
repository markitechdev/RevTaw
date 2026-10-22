import type { ListenHandlers, Listening, SpeechToText, VoiceErrorCode } from "@/lib/voice/types";
import { VOICE_ERROR_MESSAGE } from "@/lib/voice/types";

/**
 * Speech-to-text for browsers without Web Speech recognition (Firefox,
 * iPhone home-screen apps): records a short clip with MediaRecorder, stops
 * after a pause in speech, and sends it to RevTaw's server, which asks
 * Whisper (Groq, then Cloudflare) for the text. The clip is not stored.
 * Client-safe; loaded only when the student first taps the microphone.
 */

/** Stop after this long without speech once the student has spoken. */
const PAUSE_MS = 1_500;
/** Give up if nothing is heard at first. */
const NO_SPEECH_MS = 8_000;
/** Longest clip. */
const MAX_MS = 30_000;
/** Peak deviation from silence (0-128) that counts as speech. */
const SPEECH_LEVEL = 12;

export function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder === "function" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
}

function microphoneError(error: unknown): VoiceErrorCode {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "not-allowed";
  if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") return "audio-capture";
  return "unknown";
}

async function upload(clip: Blob, language: string): Promise<string> {
  const form = new FormData();
  form.set("audio", clip, "speech");
  form.set("language", language);
  const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  const body = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? VOICE_ERROR_MESSAGE.unknown);
  return (body?.text ?? "").trim();
}

export const recordedSpeechToText: SpeechToText = {
  id: "server-whisper",
  isSupported: recorderSupported,
  listen(language: string, handlers: ListenHandlers): Listening {
    let aborted = false;
    let finished = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let context: AudioContext | null = null;
    let timer = 0;
    let heardSpeech = false;
    const parts: Blob[] = [];

    const release = () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
      context = null;
    };
    const end = () => {
      if (finished) return;
      finished = true;
      release();
      handlers.onEnd();
    };
    const stop = () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      else if (!recorder) end();
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (error) {
        const code = microphoneError(error);
        handlers.onError({ code, message: VOICE_ERROR_MESSAGE[code] });
        end();
        return;
      }
      if (aborted) {
        release();
        end();
        return;
      }

      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data);
      };
      recorder.onstop = async () => {
        release();
        if (aborted) {
          end();
          return;
        }
        const clip = new Blob(parts, { type: recorder?.mimeType || mimeType || "audio/webm" });
        if (!heardSpeech || clip.size < 1_000) {
          handlers.onError({ code: "no-speech", message: VOICE_ERROR_MESSAGE["no-speech"] });
          end();
          return;
        }
        handlers.onProcessing?.();
        try {
          const text = await upload(clip, language);
          if (aborted) return end();
          if (text) handlers.onFinal(text);
          else handlers.onError({ code: "no-speech", message: VOICE_ERROR_MESSAGE["no-speech"] });
        } catch (error) {
          if (!aborted) handlers.onError({ code: "network", message: error instanceof Error ? error.message : VOICE_ERROR_MESSAGE.network });
        }
        end();
      };
      recorder.start(250);

      // Stop on a pause after speech, on long silence, or at the length limit.
      const started = Date.now();
      let lastSpeech = started;
      try {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let peak = 0;
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
          const now = Date.now();
          if (peak > SPEECH_LEVEL) {
            heardSpeech = true;
            lastSpeech = now;
          }
          if ((heardSpeech && now - lastSpeech > PAUSE_MS) || (!heardSpeech && now - started > NO_SPEECH_MS) || now - started > MAX_MS) stop();
        }, 100);
      } catch {
        // No Web Audio: assume speech and stop at the length limit (or when the student taps stop).
        heardSpeech = true;
        timer = window.setInterval(() => {
          if (Date.now() - started > MAX_MS) stop();
        }, 500);
      }
    })();

    return {
      stop,
      abort: () => {
        aborted = true;
        stop();
      },
    };
  },
};
