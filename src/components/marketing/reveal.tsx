"use client";

import type { ReactNode } from "react";

import { useReveal } from "@/lib/hooks/use-reveal";
import { cn } from "@/lib/utils";

/** Fades a block in as it scrolls into view (visible without JS and under reduced motion). */
export function Reveal({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <Tag ref={ref as never} className={cn("reveal", className)}>
      {children}
    </Tag>
  );
}
