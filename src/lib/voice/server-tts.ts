import { sharedAudio } from "@/lib/voice/audio-unlock";
import { speechChunks } from "@/lib/voice/speech-text";
import type { SpeakHandlers, Speaking, TextToSpeech } from "@/lib/voice/types";

/**
 * Text-to-speech for Filipino when the device has no Filipino voice (most
 * desktops and iPhones): RevTaw's server reads the text with Azure's
 * fil-PH neural voice and returns an MP3, played here. Client-safe.
 */

const FAILED = "RevTaw couldn't read that aloud.";
/** Characters per request: under the server's limit, and short enough to start quickly. */
const PIECE_CHARS = 700;

async function fetchSpeech(text: string, language: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, language }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? FAILED);
  }
  return response.blob();
}

export const serverTextToSpeech: TextToSpeech = {
  id: "azure-neural",
  isSupported: () => typeof window !== "undefined" && typeof Audio === "function",
  speak(text: string, language: string, handlers: SpeakHandlers): Speaking {
    const controller = new AbortController();
    const audio = sharedAudio();
    let cancelled = false;
    let url: string | null = null;
    const revoke = () => {
      if (url) URL.revokeObjectURL(url);
      url = null;
    };
    const fail = (message: string) => {
      if (cancelled) return;
      cancelled = true;
      revoke();
      handlers.onError({ code: "unknown", message });
      handlers.onEnd();
    };

    void (async () => {
      const queue = speechChunks(text, PIECE_CHARS);
      if (queue.length === 0) return handlers.onEnd();
      // Fetch the next piece while the current one plays.
      let next: Promise<Blob> | null = fetchSpeech(queue[0], language, controller.signal);
      for (let index = 0; index < queue.length; index += 1) {
        let clip: Blob;
        try {
          clip = await next!;
        } catch (error) {
          return fail(error instanceof Error && error.name !== "AbortError" ? error.message : FAILED);
        }
        if (cancelled) return;
        next = index + 1 < queue.length ? fetchSpeech(queue[index + 1], language, controller.signal) : null;
        next?.catch(() => {});
        revoke();
        url = URL.createObjectURL(clip);
        audio.src = url;
        const finished = new Promise<boolean>((resolve) => {
          audio.onended = () => resolve(true);
          audio.onerror = () => resolve(false);
          audio.onpause = () => {
            if (cancelled) resolve(true);
          };
        });
        try {
          await audio.play();
        } catch {
          return fail(FAILED);
        }
        if (index === 0) handlers.onStart();
        const played = await finished;
        if (cancelled) return;
        if (!played) return fail(FAILED);
      }
      revoke();
      if (!cancelled) {
        cancelled = true;
        handlers.onEnd();
      }
    })();

    return {
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        controller.abort();
        audio.pause();
        revoke();
        handlers.onEnd();
      },
    };
  },
};
