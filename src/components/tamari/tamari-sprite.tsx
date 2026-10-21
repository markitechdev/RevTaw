import type { CSSProperties } from "react";

import { spriteFor, spriteSrcSet, TAMARI_BLINK_SPRITES, TAMARI_SPRITES } from "@/components/tamari/sprites";
import { TAMARI_STATES, type TamariReaction, type TamariState } from "@/lib/tamari/states";
import { cn } from "@/lib/utils";

/**
 * The closed-eye frame sits on top of the open-eye one and stays hidden between
 * blinks. Said inline as well as in `.tamari-blink`, so it can never show up as
 * a second Tamari under the first one — not before the stylesheet arrives, and
 * not with a stale stylesheet from a development server. The blink animation
 * still drives its opacity: animations win over inline styles.
 */
const BLINK_STACKED: CSSProperties = { position: "absolute", inset: 0, opacity: 0 };

type Props = {
  state?: TamariState;
  /** Width and height in CSS pixels; `lgSize` from the lg breakpoint up. */
  size: number;
  lgSize?: number;
  /** Pixel animations (Settings → Tamari): off holds Tamari still in the state's pose. */
  animate?: boolean;
  /** A one-off reaction (a quick bounce); change `reactionKey` to play it again. */
  reaction?: TamariReaction | null;
  reactionKey?: number | string;
  className?: string;
};

/**
 * Tamari's picture for a state. Decorative: the state is always also said in
 * text next to it. The pixels stay sharp: the picture comes in sizes close to
 * the one on screen, is drawn with `image-rendering: pixelated`, and every
 * motion moves in whole pixels or switches frames (stepped CSS animations,
 * transforms and opacity only) and stops under reduced motion.
 */
export function TamariSprite({ state = "idle", size, lgSize, animate = true, reaction = null, reactionKey, className }: Props) {
  const definition = TAMARI_STATES[state];
  const frames = TAMARI_SPRITES[definition.pose];
  const blink = definition.blinks && animate ? TAMARI_BLINK_SPRITES[definition.pose] : undefined;
  const largest = lgSize ?? size;
  const sizes = lgSize ? `(min-width: 64rem) ${lgSize}px, ${size}px` : `${size}px`;
  const style = { "--tamari-size": `${size}px`, "--tamari-size-lg": `${largest}px` } as CSSProperties;

  return (
    <span aria-hidden="true" data-tamari={state} style={style} className={cn("relative inline-block size-(--tamari-size) shrink-0 lg:size-(--tamari-size-lg)", className)}>
      {/* Remounted per reaction, so the same reaction can play twice in a row. */}
      <span key={reactionKey} className={cn("absolute inset-0", animate && reaction && `tamari-react-${reaction}`)}>
        <span className={cn("absolute inset-0", animate && `tamari-${definition.motion}`)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized pixel art; the image optimizer would resample it */}
          <img src={spriteFor(frames, largest).src} srcSet={spriteSrcSet(frames)} sizes={sizes} width={largest} height={largest} alt="" draggable={false} decoding="async" className="tamari-sprite" />
          {blink && (
            // eslint-disable-next-line @next/next/no-img-element -- the closed-eye frame of the same picture
            <img src={spriteFor(blink, largest).src} srcSet={spriteSrcSet(blink)} sizes={sizes} width={largest} height={largest} alt="" draggable={false} decoding="async" className="tamari-sprite tamari-blink" style={BLINK_STACKED} />
          )}
        </span>
      </span>
      {definition.motion === "listen" && (
        <span className={cn("tamari-waves", !animate && "tamari-still")}>
          <i />
          <i />
          <i />
        </span>
      )}
      {definition.motion === "think" && (
        <span className={cn("tamari-dots", !animate && "tamari-still")}>
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
