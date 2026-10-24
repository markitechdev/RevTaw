import type { CSSProperties } from "react";

import { ACCENT_IDS, type AccentId, type AppearancePreferences } from "@/lib/preferences/options";
import { buildAccentPalette } from "@/lib/theme/color";

/**
 * Theme color and reduced motion on the page (UI phase §10–§11).
 *
 * The student's choice lives in their account (`preferences.appearance`). A
 * small cookie mirrors it so the root layout can put the theme color on
 * <html> in the very first response — no flash of RevTaw Purple before a
 * custom color — on every page, signed in or not. Reduce motion belongs to
 * the signed-in app only: the app frame (`AppearanceRoot`) applies it while
 * the app is open, and public pages such as the landing page keep their
 * animation (they still follow the device's prefers-reduced-motion). The
 * cookie only ever holds the values below and is re-validated on every
 * read. Client-safe.
 */

export const APPEARANCE_COOKIE = "revtaw-appearance";
/** Browsers cap cookie lifetimes at 400 days. */
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/** `accent.color.motion` — for example `blue..0` or `custom.ff8800.1`. */
export function encodeAppearance(appearance: AppearancePreferences): string {
  const color = appearance.accent === "custom" && appearance.customColor ? appearance.customColor.slice(1) : "";
  return `${appearance.accent}.${color}.${appearance.reduceMotion ? 1 : 0}`;
}

export function decodeAppearance(value: string | null | undefined): AppearancePreferences | null {
  if (!value || value.length > 32) return null;
  const match = /^([a-z]{3,7})\.([0-9a-f]{6})?\.([01])$/.exec(value);
  if (!match || !(ACCENT_IDS as readonly string[]).includes(match[1])) return null;
  const accent = match[1] as AccentId;
  const customColor = match[2] ? `#${match[2]}` : null;
  if (accent === "custom" && !customColor) return null;
  return { accent, customColor: accent === "custom" ? customColor : null, reduceMotion: match[3] === "1" };
}

export function sameAppearance(a: AppearancePreferences, b: AppearancePreferences): boolean {
  return encodeAppearance(a) === encodeAppearance(b);
}

/** Custom-color variables read by `[data-accent="custom"]` in globals.css, light and dark. */
export function customAccentVariables(hex: string): Record<string, string> {
  const palette = buildAccentPalette(hex);
  return {
    "--custom-primary": palette.light.primary,
    "--custom-primary-hover": palette.light.primaryHover,
    "--custom-primary-soft": palette.light.primarySoft,
    "--custom-primary-dark": palette.dark.primary,
    "--custom-primary-hover-dark": palette.dark.primaryHover,
    "--custom-primary-soft-dark": palette.dark.primarySoft,
  };
}

export type AppearanceAttributes = {
  "data-accent": AccentId;
  "data-motion"?: "reduce";
  style?: CSSProperties;
};

/**
 * Attributes for an element that carries the theme color: <html>, and the
 * signed-in app frame. The accent is always explicit (purple included) so the
 * frame wins over a stale cookie value on <html>.
 */
export function appearanceAttributes(appearance: AppearancePreferences): AppearanceAttributes {
  const attributes: AppearanceAttributes = { "data-accent": appearance.accent };
  if (appearance.reduceMotion) attributes["data-motion"] = "reduce";
  if (appearance.accent === "custom" && appearance.customColor) {
    attributes.style = customAccentVariables(appearance.customColor) as CSSProperties;
  }
  return attributes;
}

/** The theme color alone, for <html> on every page: the account's Reduce motion stays inside the app. */
export function themeColorAttributes(appearance: AppearancePreferences): AppearanceAttributes {
  return appearanceAttributes({ ...appearance, reduceMotion: false });
}

const CUSTOM_VARIABLES = Object.keys(customAccentVariables("#7d4de7"));

/** Applies an appearance to a live element (instant preview, and keeping <html> in step after a save). */
export function applyAppearance(element: HTMLElement, appearance: AppearancePreferences): void {
  const attributes = appearanceAttributes(appearance);
  element.dataset.accent = appearance.accent;
  if (attributes["data-motion"]) element.dataset.motion = attributes["data-motion"];
  else delete element.dataset.motion;
  const variables = appearance.accent === "custom" && appearance.customColor ? customAccentVariables(appearance.customColor) : {};
  for (const name of CUSTOM_VARIABLES) {
    if (variables[name]) element.style.setProperty(name, variables[name]);
    else element.style.removeProperty(name);
  }
}
