import { cn } from "@/lib/utils";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Ask RevTaw's face (UI phase §21): a speech bubble with eyes, in the theme
 * color. Idle it blinks now and then; listening it ripples; thinking it shows
 * three dots; speaking its mouth moves. Transform and opacity only, and every
 * animation stops under reduced motion. Decorative: the state is always also
 * said in text next to it.
 */
export function RevTawAvatar({ state = "idle", size = 40, className }: { state?: AvatarState; size?: number; className?: string }) {
  const part = "[transform-box:fill-box] [transform-origin:center]";
  return (
    <span aria-hidden="true" className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {state === "listening" && (
        <>
          <span className="absolute inset-0 animate-ripple rounded-full bg-primary/40" />
          <span className="absolute inset-0 animate-ripple rounded-full bg-primary/30 [animation-delay:0.5s]" />
        </>
      )}
      <svg viewBox="0 0 48 48" className="relative h-full w-full drop-shadow-sm">
        <path d="M24 4c11.6 0 20 7.9 20 18.2 0 10.2-8.4 18.1-20 18.1-2.2 0-4.3-.3-6.2-.8L9.5 44l2.2-7.6C7 33 4 28 4 22.2 4 11.9 12.4 4 24 4Z" className="fill-primary" />
        <g className={cn(part, state === "idle" && "animate-blink")}>
          <ellipse cx="17.2" cy={state === "thinking" ? 18.6 : 20} rx="2.7" ry={state === "listening" ? 3.8 : 3.2} className="fill-primary-foreground" />
          <ellipse cx="30.8" cy={state === "thinking" ? 18.6 : 20} rx="2.7" ry={state === "listening" ? 3.8 : 3.2} className="fill-primary-foreground" />
        </g>
        {state === "thinking" ? (
          <g className="fill-primary-foreground">
            <circle cx="18" cy="29" r="1.7" className={cn(part, "animate-think")} />
            <circle cx="24" cy="29" r="1.7" className={cn(part, "animate-think [animation-delay:0.15s]")} />
            <circle cx="30" cy="29" r="1.7" className={cn(part, "animate-think [animation-delay:0.3s]")} />
          </g>
        ) : state === "speaking" ? (
          <ellipse cx="24" cy="29.5" rx="4.6" ry="3.2" className={cn(part, "animate-talk fill-primary-foreground")} />
        ) : (
          <path d="M18.5 27.5c1.4 2 3.3 3 5.5 3s4.1-1 5.5-3" fill="none" strokeWidth="2.4" strokeLinecap="round" className="stroke-primary-foreground" />
        )}
      </svg>
    </span>
  );
}
