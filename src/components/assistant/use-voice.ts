"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Listening, Speaking, VoiceProviders } from "@/lib/voice/types";

export type VoiceStatus = "idle" | "listening" | "speaking";

type Handlers = { onPartial: (text: string) => void; onFinal: (text: string) => void };

function recognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition);
}

let loading: Promise<VoiceProviders> | null = null;
/** The voice layer is a separate chunk, fetched on the first tap of the microphone. */
function loadProviders(): Promise<VoiceProviders> {
  loading ??= import("@/lib/voice/web-speech").then((module) => module.webSpeechProviders);
  return loading;
}

/**
 * Listening and reading aloud for Ask RevTaw. One thing at a time: starting
 * to listen stops any reading, and the student can always stop either.
 */
export function useVoice(handlers: Handlers) {
  const [supported] = useState(recognitionAvailable);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(handlers);
  const listening = useRef<Listening | null>(null);
  const speaking = useRef<Speaking | null>(null);

  useEffect(() => {
    latest.current = handlers;
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
      setStatus("listening");
      let stt: VoiceProviders["stt"];
      try {
        ({ stt } = await loadProviders());
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
        onEnd: () => {
          listening.current = null;
          setStatus((current) => (current === "listening" ? "idle" : current));
        },
      });
    },
    [stopSpeaking],
  );

  const stopListening = useCallback(() => listening.current?.stop(), []);
  const cancelListening = useCallback(() => listening.current?.abort(), []);

  const speak = useCallback(async (text: string, language: string) => {
    if (!text.trim()) return;
    let tts: VoiceProviders["tts"];
    try {
      ({ tts } = await loadProviders());
    } catch {
      return;
    }
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
