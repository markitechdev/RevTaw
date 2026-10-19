import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

import type { ActionState } from "@/lib/forms/action-state";
import { cn } from "@/lib/utils";

export type AlertTone = "error" | "success" | "info";

const TONES: Record<AlertTone, { className: string; Icon: typeof AlertCircle; role: string }> = {
  error: {
    className: "border-danger/30 bg-danger-soft text-danger",
    Icon: AlertCircle,
    role: "alert",
  },
  success: {
    className: "border-success/30 bg-success-soft text-success",
    Icon: CheckCircle2,
    role: "status",
  },
  info: {
    className: "border-primary/30 bg-primary-soft text-primary",
    Icon: Info,
    role: "status",
  },
};

export function Alert({
  tone,
  children,
  className,
}: {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon, role } = TONES[tone];
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-snug",
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Renders the message from a Server Action result, if any. */
export function FormAlert({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <Alert tone={state.status === "error" ? "error" : "success"} className={className}>
      {state.message}
    </Alert>
  );
}
