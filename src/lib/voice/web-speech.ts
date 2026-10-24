import { speechChunks } from "@/lib/voice/speech-text";
import type { ListenHandlers, Listening, SpeakHandlers, Speaking, SpeechToText, TextToSpeech, VoiceErrorCode, VoiceProviders } from "@/lib/voice/types";
import { VOICE_ERROR_MESSAGE } from "@/lib/voice/types";

/**
 * The default voice layer: the browser's Web Speech API. Recognition runs in
 * the browser's own speech service (Chrome and Edge send the audio to their
 * vendor; RevTaw's server never receives it). Loaded only when the student
 * first taps the microphone.
 */

type Alternative = { transcript: string };
type Result = { isFinal: boolean; length: number; [index: number]: Alternative };
type ResultList = { length: number; [index: number]: Result };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const ERROR_CODES: Record<string, VoiceErrorCode> = {
  "not-allowed": "not-allowed",
  "service-not-allowed": "not-allowed",
  "no-speech": "no-speech",
  "audio-capture": "audio-capture",
  network: "network",
  aborted: "aborted",
};

export const webSpeechToText: SpeechToText = {
  id: "web-speech",
  isSupported: () => recognitionConstructor() !== null,
  listen(language: string, handlers: ListenHandlers): Listening {
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      queueMicrotask(() => {
        handlers.onError({ code: "unsupported", message: VOICE_ERROR_MESSAGE.unsupported });
        handlers.onEnd();
      });
      return { stop: () => {}, abort: () => {} };
    }
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let delivered = false;
    recognition.onresult = (event) => {
      let text = "";
      let final = false;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        text += result[0]?.transcript ?? "";
        if (result.isFinal) final = true;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (final && !delivered) {
        delivered = true;
        handlers.onFinal(text);
      } else if (!final) {
        handlers.onPartial(text);
      }
    };
    recognition.onerror = (event) => {
      const code = ERROR_CODES[event.error] ?? "unknown";
      handlers.onError({ code, message: VOICE_ERROR_MESSAGE[code] });
    };
    recognition.onend = () => handlers.onEnd();
    try {
      recognition.start();
    } catch {
      queueMicrotask(() => {
        handlers.onError({ code: "unknown", message: VOICE_ERROR_MESSAGE.unknown });
        handlers.onEnd();
      });
    }
    return { stop: () => recognition.stop(), abort: () => recognition.abort() };
  },
};

function pickVoice(language: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const wanted = language.toLowerCase();
  const base = wanted.split("-")[0];
  // Filipino voices are tagged "fil-PH" or "tl-PH" depending on the engine.
  const bases = base === "fil" || base === "tl" ? ["fil", "tl"] : [base];
  return (
    voices.find((voice) => voice.lang.toLowerCase() === wanted) ??
    voices.find((voice) => bases.includes(voice.lang.toLowerCase().split(/[-_]/)[0])) ??
    null
  );
}

export const webTextToSpeech: TextToSpeech = {
  id: "web-speech",
  isSupported: () => typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function",
  speak(text: string, language: string, handlers: SpeakHandlers): Speaking {
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = speechChunks(text);
    let canceled = false;
    let started = false;
    const voice = pickVoice(language);
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = voice?.lang ?? language;
      if (voice) utterance.voice = voice;
      utterance.rate = 1;
      utterance.onstart = () => {
        if (!started) {
          started = true;
          handlers.onStart();
        }
      };
      utterance.onerror = (event) => {
        if (canceled || event.error === "interrupted" || event.error === "canceled") return;
        canceled = true;
        handlers.onError({ code: "unknown", message: "RevTaw couldn't read that aloud." });
        handlers.onEnd();
      };
      if (index === chunks.length - 1) {
        utterance.onend = () => {
          if (!canceled) handlers.onEnd();
        };
      }
      synth.speak(utterance);
    });
    if (chunks.length === 0) queueMicrotask(() => handlers.onEnd());
    return {
      cancel: () => {
        if (canceled) return;
        canceled = true;
        synth.cancel();
        handlers.onEnd();
      },
    };
  },
};

/**
 * Whether this device has a voice for the language. Chrome fills its voice
 * list a moment after the page loads, so an empty list waits briefly.
 */
export async function hasBrowserVoice(language: string): Promise<boolean> {
  if (!webTextToSpeech.isSupported()) return false;
  const synth = window.speechSynthesis;
  if (synth.getVoices().length === 0) {
    await new Promise<void>((resolve) => {
      const done = () => {
        synth.removeEventListener("voiceschanged", done);
        resolve();
      };
      synth.addEventListener("voiceschanged", done);
      window.setTimeout(done, 600);
    });
  }
  return pickVoice(language) !== null;
}

export const webSpeechProviders: VoiceProviders = { stt: webSpeechToText, tts: webTextToSpeech };
