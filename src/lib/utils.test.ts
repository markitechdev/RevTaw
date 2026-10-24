import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("reads the theme's title size as a font size, so a text color does not drop it", () => {
    expect(cn("text-title font-bold text-foreground", "mt-0.5")).toBe("text-title font-bold text-foreground mt-0.5");
    expect(cn("text-sm", "text-title")).toBe("text-title");
  });

  it("resolves the theme's own font, tracking, shadow, easing and animation values", () => {
    expect(cn("font-display", "font-sans")).toBe("font-sans");
    expect(cn("font-display", "font-semibold")).toBe("font-display font-semibold");
    expect(cn("tracking-display", "tracking-tight")).toBe("tracking-tight");
    expect(cn("shadow-pop", "shadow-md")).toBe("shadow-md");
    expect(cn("ease-pop", "ease-out")).toBe("ease-out");
    expect(cn("animate-rise", "animate-pop-in")).toBe("animate-pop-in");
  });
});
