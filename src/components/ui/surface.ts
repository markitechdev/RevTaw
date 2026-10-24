/**
 * Surfaces by elevation. Panels on the page (cards, widgets, callouts) are rounded-xl with at most
 * shadow-sm; a popover opens over the page from its button; dialogs, sheets, the command menu and the
 * assistant panel float highest (rounded-2xl, shadow-pop). Chat bubbles and the flashcard face keep their
 * own rounder shapes.
 */

/** A menu or panel that opens over the page from its button (export, notifications, highlight-to-ask). */
export const POPOVER = "rounded-xl border border-border bg-card shadow-md";
