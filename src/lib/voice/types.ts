/**
 * Voice for Ask RevTaw (UI phase §21–§22), split into replaceable layers:
 * speech-to-text turns the student's voice into text, the tutor (the AI
 * layer in `src/lib/ai`, already provider-agnostic) answers, and
 * text-to-speech reads the answer back. Each layer is an interface, so the
 * browser's built-in Web Speech engine (the default) can be swapped for a
 * hosted provider without touching the assistant. Client-safe.
 */

export type VoiceErrorCode = "not-allowed" | "no-speech" | "audio-capture" | "network" | "unsupported" | "aborted" | "unknown";

export type VoiceError = { code: VoiceErrorCode; message: string };

export type ListenHandlers = {
  /** Words heard so far (changes while the student speaks). */
  onPartial: (text: string) => void;
  /** The finished sentence. */
  onFinal: (text: string) => void;
  onError: (error: VoiceError) => void;
  /** Recording stopped and the clip is being turned into text (server speech-to-text only). */
  onProcessing?: () => void;
  /** Listening stopped, for any reason. */
  onEnd: () => void;
};

export type Listening = { stop: () => void; abort: () => void };

export interface SpeechToText {
  readonly id: string;
  isSupported(): boolean;
  /** `language` is a BCP 47 tag such as "en-US" or "fil-PH". */
  listen(language: string, handlers: ListenHandlers): Listening;
}

export type SpeakHandlers = { onStart: () => void; onEnd: () => void; onError: (error: VoiceError) => void };

export type Speaking = { cancel: () => void };

export interface TextToSpeech {
  readonly id: string;
  isSupported(): boolean;
  speak(text: string, language: string, handlers: SpeakHandlers): Speaking;
}

export type VoiceProviders = { stt: SpeechToText; tts: TextToSpeech };

/** Friendly messages for what can go wrong while listening. */
export const VOICE_ERROR_MESSAGE: Record<VoiceErrorCode, string> = {
  "not-allowed": "RevTaw can't use the microphone. Allow it for this site in your browser's settings, then try again.",
  "no-speech": "I didn't hear anything. Tap the microphone and try again.",
  "audio-capture": "No microphone was found. Check that one is connected.",
  network: "Voice needs an internet connection. Type your question instead.",
  unsupported: "Voice isn't available in this browser. Try Chrome, Edge or Safari, or type your question.",
  aborted: "Listening stopped.",
  unknown: "Something went wrong with voice. Type your question instead.",
};
