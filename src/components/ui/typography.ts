/**
 * Type roles. The display face (Bricolage Grotesque, the RevTaw voice) goes with the role, not the heading
 * level: a card title looks the same as an h2 or an h3. Titles of pages, sections, cards and dialogs, and the
 * prompt a student is working on, use it; labels, overlines, callout headings and body text stay in Inter.
 */

/** The display face with its tracking, for any title role below or a headline line that is not a heading. */
export const DISPLAY_FACE = "font-display tracking-display";

/** The one page title: app pages, detail pages, the dashboard greeting, and the screens outside the app. */
export const PAGE_TITLE = `${DISPLAY_FACE} text-title font-bold leading-tight text-foreground wrap-anywhere sm:text-3xl`;

/** A section of a page (Schedule, Badges, Cards in this deck), and the title of a dialog or a sheet. */
export const SECTION_TITLE = `${DISPLAY_FACE} text-lg font-semibold`;
