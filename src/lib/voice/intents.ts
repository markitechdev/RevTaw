import { routes } from "@/lib/routes";

/**
 * Voice commands (UI phase §21, mascot doc §7): a spoken sentence becomes
 * either a command ("Tamari, open the planner", "buksan ang flashcards",
 * "open my Calculus reviewer", "review my mistakes", "save that to my notes")
 * or a question for Tamari. English, Filipino and Taglish phrasings; "Tamari"
 * (or "Hey Tamari") in front is optional. Only short sentences that start like
 * a command are treated as one, so a question that happens to begin with
 * "show me…" is still answered. Pure and client-safe.
 *
 * Nothing that changes the student's data runs straight from voice: saving
 * an answer asks for a confirmation first, and the "create" commands open
 * the usual dialog, where the student still chooses and confirms.
 */

/** Kinds of items a spoken name can find (the quick search's result types). */
export type VoiceSearchType = "material" | "note" | "quiz" | "deck";

export type VoiceIntent =
  | { kind: "navigate"; href: string; label: string }
  /** "Open my Calculus reviewer": find the item by name, else open its list (`href`). */
  | { kind: "find"; query: string; type: VoiceSearchType; href: string; label: string }
  | { kind: "theme"; theme: "light" | "dark" }
  | { kind: "save_note" }
  | { kind: "save_flashcard" }
  | { kind: "new_chat" }
  | { kind: "stop" }
  | { kind: "ask"; text: string };

type Target = { label: string; href: string; words: string[]; search?: VoiceSearchType };

const OPEN_TARGETS: Target[] = [
  { label: "Home", href: routes.dashboard, words: ["home", "dashboard", "homepage", "home page"] },
  { label: "Study", href: routes.study, words: ["study", "study page", "aral", "pag aaral"] },
  { label: "Materials", href: routes.materials, words: ["materials", "material", "files", "file", "modules", "module", "documents", "document", "lessons", "lesson", "handouts", "handout"], search: "material" },
  { label: "Planner", href: routes.planner, words: ["planner", "calendar", "schedule", "plan", "kalendaryo", "iskedyul"] },
  { label: "Quizzes", href: routes.quiz, words: ["quizzes", "quiz", "tests", "test", "pagsusulit"], search: "quiz" },
  { label: "Flashcards", href: routes.flashcards, words: ["flashcards", "flashcard", "flash cards", "cards", "decks", "deck"], search: "deck" },
  { label: "Notes", href: routes.notes, words: ["notes", "reviewers", "reviewer", "tala"], search: "note" },
  { label: "Study Methods", href: routes.methods, words: ["study methods", "methods", "techniques"] },
  { label: "Progress", href: routes.progress, words: ["progress", "stats", "statistics", "scores", "grades"] },
  { label: "Mistake notebook", href: routes.mistakes, words: ["mistake notebook", "mistakes", "wrong answers", "mga mali", "mali"] },
  { label: "AI Tutor", href: routes.tutor, words: ["ai tutor", "tutor"] },
  { label: "Achievements", href: routes.achievements, words: ["achievements", "badges", "rewards"] },
  { label: "Study map", href: routes.studyMap, words: ["study map", "map"] },
  { label: "Memory aids", href: routes.memoryAids, words: ["memory aids", "memory", "mnemonics"] },
  { label: "Settings", href: routes.settings, words: ["settings", "setting", "preferences", "account"] },
];

const CREATE_TARGETS: Target[] = [
  { label: "Create a quiz", href: `${routes.quiz}?create=1`, words: ["quiz", "test", "pagsusulit", "practice test"] },
  { label: "Create flashcards", href: `${routes.flashcards}?create=1`, words: ["flashcards", "flash cards", "deck", "cards"] },
  { label: "Create a reviewer", href: routes.notesNew, words: ["reviewer", "notes", "summary", "cheat sheet"] },
  { label: "Add an exam", href: `${routes.planner}?exam=new`, words: ["exam", "examination", "long test"] },
  { label: "Upload material", href: `${routes.materials}?upload=1`, words: ["material", "file", "module", "document", "handout", "pdf"] },
];

const START_TARGETS: Target[] = [
  { label: "Smart Study", href: `${routes.study}?method=smart_study`, words: ["smart study", "smart session", "session", "study session"] },
  { label: "Pomodoro", href: `${routes.study}?method=pomodoro`, words: ["pomodoro", "focus session", "focus", "timer"] },
  { label: "Flashcard review", href: `${routes.flashcards}/review`, words: ["flashcards", "flashcard review", "flash cards", "cards", "review"] },
  { label: "Retest my mistakes", href: `${routes.study}?method=error_review`, words: ["mistakes", "error review", "retest"] },
  { label: "Study", href: routes.study, words: ["studying", "study", "mag aral"] },
];

const OPEN_VERBS = ["take me to", "bring me to", "navigate to", "go to", "go back to", "show me", "show", "open", "pumunta sa", "punta sa", "pumunta", "buksan", "ipakita", "tingnan", "puntahan"];
const CREATE_VERBS = ["generate", "create", "make", "upload", "add", "new", "gumawa ng", "gawa ng", "gumawa", "magdagdag ng", "magdagdag", "mag upload"];
const START_VERBS = ["lets start", "start", "begin", "review", "simulan", "umpisahan", "magsimula ng", "magsimula", "i review", "mag review"];
const FILLERS = new Set(["a", "an", "the", "my", "me", "some", "new", "page", "please", "ang", "ng", "mga", "sa", "ko", "aking", "mo", "nga", "po", "natin", "yung", "iyong", "for", "to", "of", "about", "on", "called", "named", "titled", "tungkol", "na"]);
/** "Tamari, …" / "Hey Tamari …" (and the older "RevTaw, …") in front of a command or question. */
const WAKE = /^(hey |hi |ok |okay |uy |oy |hoy )?(tamari|tamary|tamaree|tamarie|tamare|revtaw|rev taw)([,\s]+|$)/;
/** The same wake word on the original transcript, so a question keeps its own case and punctuation. */
const WAKE_ORIGINAL = /^\s*(?:(?:hey|hi|ok|okay|uy|oy|hoy)[\s,]+)?(?:tamari|tamary|tamaree|tamarie|tamaré|tamare|revtaw|rev taw)\b[\s,.!?]*/i;
const POLITE = /^(please |pakiusap |paki |pwede (mo )?(bang |ba )?|can you |could you )+/;

/** Lowercase words without punctuation or accents; wake words and "please" removed. */
export function normalizeSpeech(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(WAKE, "")
    .replace(POLITE, "")
    .trim();
}

function stripVerb(text: string, verbs: string[]): string | null {
  for (const verb of verbs) {
    if (text === verb) return "";
    if (text.startsWith(`${verb} `)) return text.slice(verb.length + 1);
  }
  return null;
}

/** The target a short command names, and any other words in it (the name of an item: "calculus" in "open my calculus reviewer"). */
function findTarget(rest: string, targets: Target[]): { target: Target; extra: string } | null {
  const words = rest.split(" ").filter((word) => word && !FILLERS.has(word));
  if (words.length === 0) return null;
  const phrase = ` ${words.join(" ")} `;
  // The longest matching phrase wins ("study methods" over "study").
  let best: { target: Target; word: string } | null = null;
  for (const target of targets) {
    for (const word of target.words) {
      if (phrase.includes(` ${word} `) && (!best || word.length > best.word.length)) best = { target, word };
    }
  }
  if (!best) return null;
  return { target: best.target, extra: phrase.replace(` ${best.word} `, " ").trim() };
}

const STOP = /^(stop|stop talking|stop reading|stop speaking|be quiet|quiet|tama na|hinto|tumigil|cancel|never mind|nevermind|wag na|huwag na|okay stop)$/;
const NEW_CHAT = /^((start )?(a )?new (chat|conversation)|bagong (chat|usapan))$/;
const SAVE_NOTE = /^((save|add|put|keep|isave|i save|ilagay|idagdag|itala)( (that|this|it|the answer|iyan|yan|ito|iyon))?( (to|in|into|sa))?( (my|aking|ang|mga))?( (notes?|tala))|add to( my)? notes|save (that|this|it)|isave (mo )?(yan|iyan|ito))$/;
const SAVE_CARD = /^((make|create|add|save|turn)( (that|this|it|iyan|yan|ito))?( (into|as|to))?( a| an)? flash ?card( (from|of|out of) (that|this|it))?|(gawin|gawing|gawin mong|gawing isang) (flash ?card)( (yan|iyan|ito))?|(make|create|turn) (that|this|it) (into )?(a )?flash ?card)$/;
const THEME_VERB = /^(turn on|switch to|use|change to|gawing|go) /;
const DARK = /^((turn on|switch to|use|change to|gawing|go) )?(the )?(dark|madilim)( (mode|theme))?$/;
const LIGHT = /^((turn on|switch to|use|change to|gawing|go) )?(the )?(light|maliwanag)( (mode|theme))?$/;

/** Turns what the student said into a command or a question. */
export function routeVoiceCommand(transcript: string): VoiceIntent {
  const original = transcript.replace(/\s+/g, " ").trim();
  const text = normalizeSpeech(original);
  if (!text) return { kind: "ask", text: "" };
  if (STOP.test(text)) return { kind: "stop" };
  if (NEW_CHAT.test(text)) return { kind: "new_chat" };
  if (SAVE_NOTE.test(text)) return { kind: "save_note" };
  if (SAVE_CARD.test(text)) return { kind: "save_flashcard" };
  // "Dark mode", "switch to light": a theme word plus "mode"/"theme" or a verb, so a question about light is still a question.
  const themed = /\b(mode|theme)$/.test(text) || THEME_VERB.test(text);
  if (themed && DARK.test(text)) return { kind: "theme", theme: "dark" };
  if (themed && LIGHT.test(text)) return { kind: "theme", theme: "light" };

  // Commands are short; anything longer is a question even if it starts like one.
  if (text.split(" ").length <= 7) {
    const start = stripVerb(text, START_VERBS);
    if (start !== null) {
      const found = findTarget(start || "studying", START_TARGETS);
      if (found) return { kind: "navigate", href: found.target.href, label: found.target.label };
    }
    const create = stripVerb(text, CREATE_VERBS);
    if (create !== null) {
      const found = findTarget(create, CREATE_TARGETS);
      if (found) return { kind: "navigate", href: found.target.href, label: found.target.label };
    }
    const open = stripVerb(text, OPEN_VERBS);
    if (open !== null) {
      const found = findTarget(open, OPEN_TARGETS);
      if (found?.target.search && found.extra) return { kind: "find", query: found.extra, type: found.target.search, href: found.target.href, label: found.target.label };
      if (found) return { kind: "navigate", href: found.target.href, label: found.target.label };
    }
  }
  return { kind: "ask", text: original.replace(WAKE_ORIGINAL, "").trim() };
}

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|go|go ahead|do it|save it|confirm|oo|opo|oho|sige|sige na|tama|game)$/;
const NO = /^(no|nope|cancel|stop|dont|do not|never mind|nevermind|hindi|huwag|wag|ayoko|hindi na)$/;

/** Reads a spoken answer to "Save this to your notes?": yes, no, or not sure. */
export function confirmationAnswer(transcript: string): "yes" | "no" | null {
  const text = normalizeSpeech(transcript).replace(/ please$/, "").replace(/ po$/, "");
  if (YES.test(text)) return "yes";
  if (NO.test(text)) return "no";
  return null;
}
