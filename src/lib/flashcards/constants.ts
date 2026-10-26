/** Deck size limits shared by the dialog, the API route and the generator. */
export const FLASHCARD_MIN = 5;
export const FLASHCARD_MAX = 60;
export const FLASHCARD_PRESETS = [10, 20, 30] as const;
/** The deck size the dialog starts at, and what a deck made before its size was stored retries with. */
export const FLASHCARD_DEFAULT = 20;
