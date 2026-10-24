export type TintTone = "primary" | "info" | "success" | "warning" | "danger";

/**
 * A tinted box that carries a tone: a result (right, partly right, wrong), a notice inside a page, a tip or a
 * note from Tamari. One border and one fill per tone, so a "correct" box looks the same in every study method.
 * Alerts and badges keep their own stronger fills; featured cards (the dashboard's recommendation) too.
 */
export const TINT: Record<TintTone, string> = {
  primary: "border-primary/40 bg-primary-soft/50",
  info: "border-info/40 bg-info-soft/50",
  success: "border-success/40 bg-success-soft/50",
  warning: "border-warning/40 bg-warning-soft/50",
  danger: "border-danger/40 bg-danger-soft/50",
};

/**
 * An item marked out in a study method: the option the student picked, the stop they are on, the facts a
 * hovered line came from. The full theme border on a light tint, stronger than TINT.primary.
 */
export const MARKED = "border-primary bg-primary-soft/40";
