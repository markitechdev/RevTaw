import { describe, expect, it } from "vitest";

import { buildAccentPalette, contrastRatio, hexToRgb, isHexColor, oklchToHex, rgbToHex, rgbToOklch, SURFACES } from "@/lib/theme/color";

describe("color conversions", () => {
  it("round-trips hex through OKLCH", () => {
    for (const hex of ["#7d4de7", "#1c69e3", "#007e3f", "#b44f00", "#c52c7c", "#d4212d", "#007c79", "#123456"]) {
      expect(oklchToHex(rgbToOklch(hexToRgb(hex)))).toBe(hex);
    }
  });

  it("validates hex input", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("a1b2c3")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#a1b2c3;}body{")).toBe(false);
    expect(rgbToHex({ r: 2, g: -1, b: 0.5 })).toBe("#ff0080");
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("accent palettes", () => {
  const seeds = ["#7d4de7", "#ffff00", "#00ff00", "#ff00ff", "#00ffff", "#8b4513", "#ff7f50", "#2f4f4f", "#ffc0cb", "#4b0082", "#f0e68c"];

  it.each(seeds)("keeps %s readable in light and dark mode", (seed) => {
    const palette = buildAccentPalette(seed);
    expect(contrastRatio(palette.light.primary, palette.light.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.light.primary, SURFACES.light.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.light.primary, SURFACES.light.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.light.primary, palette.light.primarySoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.dark.primary, palette.dark.primaryForeground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.dark.primary, SURFACES.dark.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.dark.primary, SURFACES.dark.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.dark.primary, palette.dark.primarySoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("turns grays into an ink accent instead of a random hue", () => {
    expect(buildAccentPalette("#808080")).toEqual(buildAccentPalette("#ffffff"));
    expect(buildAccentPalette("#000000").light.primary).toBe("#2e2a40");
  });

  it("keeps the hue of the chosen color", () => {
    const seed = rgbToOklch(hexToRgb("#1c69e3"));
    const built = rgbToOklch(hexToRgb(buildAccentPalette("#1c69e3").light.primary));
    expect(Math.abs(built.h - seed.h)).toBeLessThan(4);
  });
});
