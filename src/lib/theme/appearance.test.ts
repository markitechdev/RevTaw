import { describe, expect, it } from "vitest";

import { appearanceAttributes, decodeAppearance, encodeAppearance, themeColorAttributes } from "@/lib/theme/appearance";

describe("appearance cookie", () => {
  it("round-trips presets and custom colors", () => {
    const blue = { accent: "blue", customColor: null, reduceMotion: false } as const;
    const custom = { accent: "custom", customColor: "#ff8800", reduceMotion: true } as const;
    expect(encodeAppearance(blue)).toBe("blue..0");
    expect(encodeAppearance(custom)).toBe("custom.ff8800.1");
    expect(decodeAppearance(encodeAppearance(blue))).toEqual(blue);
    expect(decodeAppearance(encodeAppearance(custom))).toEqual(custom);
  });

  it("drops a stray color on a preset", () => {
    expect(decodeAppearance("teal.ff8800.0")).toEqual({ accent: "teal", customColor: null, reduceMotion: false });
  });

  it("rejects anything else", () => {
    for (const value of ["", "neon..0", "custom..0", "blue..2", "blue.FF8800.0", "blue..0;x", "a".repeat(40), "blue.ff8800\"/><script>.0"]) {
      expect(decodeAppearance(value)).toBeNull();
    }
    expect(decodeAppearance(undefined)).toBeNull();
  });
});

describe("appearanceAttributes", () => {
  it("always names the accent and only adds what is needed", () => {
    expect(appearanceAttributes({ accent: "purple", customColor: null, reduceMotion: false })).toEqual({ "data-accent": "purple" });
    expect(appearanceAttributes({ accent: "green", customColor: null, reduceMotion: true })).toEqual({ "data-accent": "green", "data-motion": "reduce" });
  });

  it("leaves Reduce motion to the app: <html> on every page gets the theme color only", () => {
    expect(themeColorAttributes({ accent: "green", customColor: null, reduceMotion: true })).toEqual({ "data-accent": "green" });
    const custom = themeColorAttributes({ accent: "custom", customColor: "#ff8800", reduceMotion: true });
    expect(custom["data-motion"]).toBeUndefined();
    expect((custom.style as Record<string, string>)["--custom-primary"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("adds contrast-checked custom variables for a custom color", () => {
    const attributes = appearanceAttributes({ accent: "custom", customColor: "#ff8800", reduceMotion: false });
    expect(attributes["data-accent"]).toBe("custom");
    const style = attributes.style as Record<string, string>;
    for (const name of ["--custom-primary", "--custom-primary-hover", "--custom-primary-soft", "--custom-primary-dark", "--custom-primary-hover-dark", "--custom-primary-soft-dark"]) {
      expect(style[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
