/**
 * The real radio or checkbox inside a styled choice (an option card, a chip, a segment). It is invisible but
 * laid over the whole control, so the control is its hit area for a pointer, a fingertip and a screen
 * reader's touch exploration (a 1 px visually hidden input is none of these), while the label draws the look
 * from the input's state (has-checked, has-focus-visible, has-disabled). The label must be `relative`.
 */
export const CHOICE_INPUT = "absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed";
