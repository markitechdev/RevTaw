import type { CSSProperties } from "react";

import { spriteFor, spriteSrcSet } from "@/components/tamari/sprites";
import { TAMARI_STATES, type TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

type Props = {
  state?: TamariState;
  /** Width and height in CSS pixels; `lgSize` from the lg breakpoint up. */
  size: number;
  lgSize?: number;
  /** "full": the whole character; "portrait": head and shoulders on Tamari's navy tile (small spots like the chat header). */
  frame?: "full" | "portrait";
  /** Idle-type motions (a 1–2 px bob, breathing while asleep); off when the student turns idle animations off. */
  ambient?: boolean;
  /** One small hop when it appears (Tamari reacting to being opened). */
  greet?: boolean;
  className?: string;
};

/**
 * Tamari's picture for a state. Decorative: the state is always also said in
 * text next to it. The pixels stay sharp: the picture comes in sizes close to
 * the one on screen, is drawn with `image-rendering: pixelated`, and every
 * motion moves in whole pixels (stepped CSS animations, transforms only) and
 * stops under reduced motion.
 */
export function TamariSprite({ state = "idle", size, lgSize, frame = "full", ambient = true, greet = false, className }: Props) {
  const definition = TAMARI_STATES[state];
  const moving = ambient || !definition.ambient;
  const scale = frame === "portrait" ? 1.6 : 1;
  const render = Math.round(size * scale);
  const renderLg = lgSize ? Math.round(lgSize * scale) : null;
  const style = { "--tamari-size": `${size}px`, "--tamari-size-lg": `${lgSize ?? size}px` } as CSSProperties;

  return (
    <span aria-hidden="true" data-tamari={state} style={style} className={cn("relative inline-block size-(--tamari-size) shrink-0 lg:size-(--tamari-size-lg)", greet && "tamari-greet", className)}>
      {definition.motion === "listen" && <span className={cn("tamari-ring", frame === "portrait" ? "rounded-[30%]" : "rounded-full")} />}
      <span className={cn("absolute inset-0", frame === "portrait" && "tamari-portrait")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized pixel art; the image optimizer would resample it */}
        <img
          src={spriteFor(definition.pose, renderLg ?? render).src}
          srcSet={spriteSrcSet(definition.pose)}
          sizes={renderLg ? `(min-width: 64rem) ${renderLg}px, ${render}px` : `${render}px`}
          width={render}
          height={render}
          alt=""
          draggable={false}
          decoding="async"
          className={cn("tamari-sprite", moving && `tamari-${definition.motion}`)}
        />
      </span>
      {definition.motion === "think" && (
        <span className="tamari-dots">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
