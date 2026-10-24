import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("reads the theme's title size as a font size, so a text color does not drop it", () => {
    expect(cn("text-title font-bold text-foreground", "mt-0.5")).toBe("text-title font-bold text-foreground mt-0.5");
    expect(cn("text-sm", "text-title")).toBe("text-title");
    expect(cn("text-2xs font-medium", "text-muted-foreground")).toBe("text-2xs font-medium text-muted-foreground");
    expect(cn("text-3xs text-primary")).toBe("text-3xs text-primary");
    expect(cn("text-reading text-foreground/90")).toBe("text-reading text-foreground/90");
  });

  it("resolves the theme's own font, tracking, shadow, easing and animation values", () => {
    expect(cn("font-display", "font-sans")).toBe("font-sans");
    expect(cn("font-display", "font-semibold")).toBe("font-display font-semibold");
    expect(cn("tracking-display", "tracking-tight")).toBe("tracking-tight");
    expect(cn("tracking-label", "tracking-wide")).toBe("tracking-wide");
    expect(cn("leading-display", "leading-tight")).toBe("leading-tight");
    expect(cn("shadow-pop", "shadow-md")).toBe("shadow-md");
    expect(cn("ease-pop", "ease-out")).toBe("ease-out");
    expect(cn("animate-rise", "animate-pop-in")).toBe("animate-pop-in");
  });
});
