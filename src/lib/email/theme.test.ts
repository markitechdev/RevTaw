import { describe, expect, it } from "vitest";

import { EMAIL_COLORS as C, EMAIL_DARK as D } from "@/lib/email/theme";
import { contrastRatio } from "@/lib/theme/color";

/** Every text color against the surface it sits on, in the light and the dark email. */
const LIGHT: Array<[string, string, string]> = [
  ["headings on the card", C.navy, C.white],
  ["body text on the card", C.text, C.white],
  ["muted text on the card", C.muted, C.white],
  ["links and title accents on the card", C.blue, C.white],
  ["button text on the button", C.white, C.blue],
  ["the notice title", C.navy, C.page],
  ["the notice text", C.noticeText, C.page],
];

const DARK: Array<[string, string, string]> = [
  ["headings on the card", D.heading, D.card],
  ["body text on the card", D.text, D.card],
  ["muted text on the card", D.muted, D.card],
  ["links and title accents on the card", D.accent, D.card],
  ["button text on the button", C.white, C.blue],
  ["the notice title", D.heading, D.notice],
  ["the notice text", D.noticeText, D.notice],
];

describe("email colors", () => {
  it.each(LIGHT)("light: %s pass WCAG AA", (_name, text, surface) => {
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(DARK)("dark: %s pass WCAG AA", (_name, text, surface) => {
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the logo's navy", () => {
    expect(C.navy).toBe("#002858");
  });
});
