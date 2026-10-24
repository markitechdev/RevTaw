import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge knows Tailwind's default scales only. The theme's own values (globals.css @theme) are added
 * here, so `text-title` is read as a font size, not a color that `text-foreground` would drop.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["title", "reading", "2xs", "3xs"],
      font: ["display"],
      tracking: ["display", "label"],
      leading: ["display"],
      shadow: ["pop"],
      ease: ["pop"],
      animate: ["fade-up", "rise", "pop-in", "sheet-up", "panel-in", "caret", "float"],
    },
  },
});

/** Merge Tailwind class names, resolving conflicts (later classes win). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
