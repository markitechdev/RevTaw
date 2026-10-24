import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A bordered surface. Use it for things that are objects (a deck, an exam, a
 * widget); plain sections, lists and dividers carry most page structure.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

/**
 * Card titles are level-2 headings by default: cards sit directly under the
 * page's h1, so h3 would skip a level. Pass `as` when the card is nested
 * under another heading.
 */
export function CardTitle({ as: Tag = "h2", className, ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-base font-semibold leading-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
