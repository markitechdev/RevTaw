"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { primeAudio } from "@/lib/voice/audio-unlock";
import type { Listening, Speaking, SpeechToText, TextToSpeech } from "@/lib/voice/types";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "speaking";

/** What this RevTaw server can do for voice (set in the app layout from its configuration). */
export type ServerVoice = { transcribe: boolean; speak: boolean };

type Handlers = { onPartial: (text: string) => void; onFinal: (text: string) => void };

function recognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition);
}

function recorderAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder === "function" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function isFilipino(language: string): boolean {
  const base = language.toLowerCase().split(/[-_]/)[0];
  return base === "fil" || base === "tl";
}

type Loaded = { stt: SpeechToText; tts: TextToSpeech; hasBrowserVoice: (language: string) => Promise<boolean>; serverTts: TextToSpeech | null };

let loading: Promise<Loaded> | null = null;
/**
 * The voice layer is a separate chunk, fetched on the first tap of the
 * microphone: the browser's Web Speech, plus the server fallbacks when this
 * server offers them (recording for browsers that cannot listen, Filipino
 * read-aloud for devices without a Filipino voice).
 */
function loadProviders(server: ServerVoice): Promise<Loaded> {
  loading ??= (async () => {
    const web = await import("@/lib/voice/web-speech");
    const stt = !recognitionAvailable() && server.transcribe && recorderAvailable() ? (await import("@/lib/voice/recorder")).recordedSpeechToText : web.webSpeechToText;
    const serverTts = server.speak ? (await import("@/lib/voice/server-tts")).serverTextToSpeech : null;
    return { stt, tts: web.webTextToSpeech, hasBrowserVoice: web.hasBrowserVoice, serverTts };
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * Listening and reading aloud for Ask RevTaw. One thing at a time: starting
 * to listen stops any reading, and the student can always stop either.
 */
export function useVoice(handlers: Handlers, server: ServerVoice = { transcribe: false, speak: false }) {
  const [supported] = useState(() => recognitionAvailable() || (server.transcribe && recorderAvailable()));
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(handlers);
  const serverRef = useRef(server);
  const listening = useRef<Listening | null>(null);
  const speaking = useRef<Speaking | null>(null);

  useEffect(() => {
    latest.current = handlers;
    serverRef.current = server;
  });

  useEffect(
    () => () => {
      listening.current?.abort();
      speaking.current?.cancel();
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    const current = speaking.current;
    speaking.current = null;
    current?.cancel();
  }, []);

  const listen = useCallback(
    async (language: string) => {
      stopSpeaking();
      setError(null);
      if (listening.current) return;
      // Inside the tap: lets a Filipino answer read by the server play later on iPhone.
      if (serverRef.current.speak) primeAudio();
      setStatus("listening");
      let stt: SpeechToText;
      try {
        ({ stt } = await loadProviders(serverRef.current));
      } catch {
        setStatus("idle");
        setError("Voice could not start. Check your connection and try again.");
        return;
      }
      listening.current = stt.listen(language, {
        onPartial: (text) => latest.current.onPartial(text),
        onFinal: (text) => latest.current.onFinal(text),
        onError: (problem) => {
          if (problem.code !== "aborted") setError(problem.message);
        },
        onProcessing: () => setStatus((current) => (current === "listening" ? "transcribing" : current)),
        onEnd: () => {
          listening.current = null;
          setStatus((current) => (current === "listening" || current === "transcribing" ? "idle" : current));
        },
      });
    },
    [stopSpeaking],
  );

  const stopListening = useCallback(() => listening.current?.stop(), []);
  const cancelListening = useCallback(() => listening.current?.abort(), []);

  const speak = useCallback(async (text: string, language: string) => {
    if (!text.trim()) return;
    let loaded: Loaded;
    try {
      loaded = await loadProviders(serverRef.current);
    } catch {
      return;
    }
    // Filipino answers on a device without a Filipino voice are read by the server's neural voice.
    const useServer = loaded.serverTts !== null && isFilipino(language) && !(await loaded.hasBrowserVoice(language));
    const tts = useServer ? loaded.serverTts! : loaded.tts;
    if (!tts.isSupported()) return;
    speaking.current?.cancel();
    setStatus("speaking");
    let session: Speaking | null = null;
    session = tts.speak(text, language, {
      onStart: () => {},
      onEnd: () => {
        if (session && speaking.current === session) speaking.current = null;
        setStatus((current) => (current === "speaking" ? "idle" : current));
      },
      onError: (problem) => setError(problem.message),
    });
    speaking.current = session;
  }, []);

  return { supported, status, error, clearError: () => setError(null), listen, stopListening, cancelListening, speak, stopSpeaking };
}
