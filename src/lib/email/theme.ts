/**
 * The look of every RevTaw email: the logo's navy, RevTaw blue and white, with a light page around a white card.
 * Email clients ignore stylesheets they don't know, so each value is written inline where it is used; the dark
 * values below replace them only in clients that honor `prefers-color-scheme` (Apple Mail, iOS Mail, Outlook.com).
 * Every text color passes WCAG AA (4.5:1) on the surface it sits on, in both themes (theme.test.ts).
 */

export const EMAIL_COLORS = {
  /** The logo's navy: headings and the "Rev" of the wordmark. */
  navy: "#002858",
  /** RevTaw blue (the blue accent of the app): buttons, links, the "Taw" of the wordmark, title accents. */
  blue: "#1C69E3",
  white: "#FFFFFF",
  /** The page around the card. */
  page: "#F5F8FC",
  /** Body text. */
  text: "#334155",
  /** Greetings, labels and the footer. */
  muted: "#64748B",
  /** Text inside the notice box (which uses the page color, so the icon's soft circle shows on it). */
  noticeText: "#475569",
  /** The soft circle behind the icons (drawn into the PNGs in public/email). */
  soft: "#EAF1FF",
  /** Card border and dividers. */
  border: "#E3EAF4",
} as const;

/** The same roles where the client shows email in dark mode. */
export const EMAIL_DARK = {
  page: "#0B1220",
  card: "#121B2E",
  border: "#26324A",
  heading: "#F1F5FB",
  accent: "#7CB0FF",
  text: "#D5DDEA",
  muted: "#9AA8BD",
  notice: "#18233A",
  noticeText: "#C9D3E3",
} as const;

/** System fonts only: web fonts don't load in most email clients, and these need no download. */
export const EMAIL_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** The card's width on a desktop; it shrinks to the screen on a phone. */
export const EMAIL_WIDTH = 600;
