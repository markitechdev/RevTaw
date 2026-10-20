/**
 * Small, dependency-free color math for RevTaw's theme colors.
 *
 * Accent palettes are built in OKLCH so every preset (and any custom color a
 * student picks) gets the same perceived lightness, then nudged until the
 * WCAG contrast pairs the UI relies on pass:
 *
 * - light mode: white text on the accent, and the accent as text/links on
 *   the light surfaces (≥ 4.5:1);
 * - dark mode: dark ink text on the accent, and the accent on dark surfaces.
 *
 * Pure functions only, so the same code runs on the server (custom colors are
 * rendered into the page) and in tests.
 */

export type Rgb = { r: number; g: number; b: number };
export type Oklch = { l: number; c: number; h: number };

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match) throw new Error(`Not a hex color: ${hex}`);
  const value = parseInt(match[1], 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const toGamma = (value: number) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** OKLCH → sRGB without clamping (channels may fall outside 0–1). */
function oklchToRgbRaw({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const inGamut = ({ r, g, b }: Rgb) => [r, g, b].every((value) => value >= -0.0005 && value <= 1.0005);

/** OKLCH → hex, reducing chroma until the color fits in sRGB (keeps hue and lightness). */
export function oklchToHex(color: Oklch): string {
  if (inGamut(oklchToRgbRaw(color))) return rgbToHex(oklchToRgbRaw(color));
  let low = 0;
  let high = color.c;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToRgbRaw({ ...color, c: mid }))) low = mid;
    else high = mid;
  }
  return rgbToHex(oklchToRgbRaw({ ...color, c: low }));
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The surfaces accent colors are checked against (must match globals.css). */
export const SURFACES = {
  light: { background: "#f7f6fb", card: "#ffffff", muted: "#efedf5", ink: "#ffffff" },
  dark: { background: "#0f0d17", card: "#17141f", muted: "#221e2e", ink: "#0f0d17" },
} as const;

export type AccentShades = {
  /** Buttons, active navigation, progress, links. */
  primary: string;
  primaryHover: string;
  /** Text and icons on the accent. */
  primaryForeground: string;
  /** Tinted background for selected states (accent text stays readable on it). */
  primarySoft: string;
  ring: string;
};

export type AccentPalette = { light: AccentShades; dark: AccentShades };

const MIN_CONTRAST = 4.6; // a little headroom over WCAG AA (4.5:1)

/** "Ink" accent for gray seeds: charcoal in light mode, pale lavender-gray in dark. */
const NEUTRAL_PALETTE: AccentPalette = {
  light: { primary: "#2e2a40", primaryHover: "#1f1c2e", primaryForeground: "#ffffff", primarySoft: "#efedf5", ring: "#2e2a40" },
  dark: { primary: "#d6d3e3", primaryHover: "#e8e6f1", primaryForeground: "#0f0d17", primarySoft: "#2a2638", ring: "#d6d3e3" },
};

function passes(hex: string, against: string[]): boolean {
  return against.every((surface) => contrastRatio(hex, surface) >= MIN_CONTRAST);
}

/**
 * Builds light and dark accent shades from any color: the hue (and, within
 * limits, the chroma) is kept; lightness is chosen so the contrast pairs pass.
 */
export function buildAccentPalette(seed: string | Oklch): AccentPalette {
  const base = typeof seed === "string" ? rgbToOklch(hexToRgb(seed)) : seed;
  // Black, white and grays have no meaningful hue: they become an ink accent.
  if (base.c < 0.03) return NEUTRAL_PALETTE;
  const hue = base.h;
  // Near-gray seeds keep a little chroma so the accent still reads as a color.
  const chroma = Math.max(0.04, Math.min(base.c, 0.22));

  const light = (() => {
    const against = [SURFACES.light.card, SURFACES.light.background, SURFACES.light.ink];
    let l = 0.56;
    let primary = oklchToHex({ l, c: chroma, h: hue });
    while (!passes(primary, against) && l > 0.2) {
      l -= 0.01;
      primary = oklchToHex({ l, c: chroma, h: hue });
    }
    const soft = oklchToHex({ l: 0.955, c: Math.min(chroma, 0.04), h: hue });
    return {
      primary,
      primaryHover: oklchToHex({ l: l - 0.05, c: chroma, h: hue }),
      primaryForeground: SURFACES.light.ink,
      primarySoft: contrastRatio(primary, soft) >= 4.5 ? soft : oklchToHex({ l: 0.975, c: Math.min(chroma, 0.02), h: hue }),
      ring: primary,
    };
  })();

  const dark = (() => {
    const darkChroma = Math.min(chroma, 0.16);
    const against = [SURFACES.dark.card, SURFACES.dark.background, SURFACES.dark.muted, SURFACES.dark.ink];
    let l = 0.72;
    let primary = oklchToHex({ l, c: darkChroma, h: hue });
    while (!passes(primary, against) && l < 0.95) {
      l += 0.01;
      primary = oklchToHex({ l, c: darkChroma, h: hue });
    }
    let softL = 0.27;
    let soft = oklchToHex({ l: softL, c: Math.min(darkChroma, 0.06), h: hue });
    while (contrastRatio(primary, soft) < 4.5 && softL > 0.16) {
      softL -= 0.01;
      soft = oklchToHex({ l: softL, c: Math.min(darkChroma, 0.06), h: hue });
    }
    return {
      primary,
      primaryHover: oklchToHex({ l: Math.min(0.97, l + 0.05), c: darkChroma, h: hue }),
      primaryForeground: SURFACES.dark.ink,
      primarySoft: soft,
      ring: primary,
    };
  })();

  return { light, dark };
}
