/**
 * One audio element for read-aloud answers from the server. iPhone only lets
 * an element play later if it first played during a tap, so the tap that
 * starts voice mode plays a few milliseconds of silence on it. Client-safe.
 */

let element: HTMLAudioElement | null = null;

export function sharedAudio(): HTMLAudioElement {
  element ??= new Audio();
  return element;
}

/** 37 ms of silence (8 kHz, 8-bit mono WAV). */
function silence(): string {
  const header = [82, 73, 70, 70, 76, 1, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 64, 31, 0, 0, 1, 0, 8, 0, 100, 97, 116, 97, 40, 1, 0, 0];
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...header) + String.fromCharCode(128).repeat(296))}`;
}

/** Call synchronously inside the tap's event handler. */
export function primeAudio(): void {
  if (typeof window === "undefined" || typeof Audio !== "function") return;
  const audio = sharedAudio();
  if (audio.dataset.primed) return;
  audio.dataset.primed = "1";
  audio.src = silence();
  void audio.play().catch(() => {
    delete audio.dataset.primed;
  });
}
