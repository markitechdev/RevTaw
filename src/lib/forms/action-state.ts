/**
 * Shared result shape for Server Actions driven by `useActionState`.
 *
 * - `status: "error"` renders `message` in an alert and `fieldErrors` under
 *   the matching inputs; `values` lets forms keep what the user typed.
 * - `status: "success"` renders `message` as a confirmation.
 */
export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export const IDLE_STATE: ActionState = { status: "idle" };

export function errorState(
  message: string,
  extras: Omit<ActionState, "status" | "message"> = {},
): ActionState {
  return { status: "error", message, ...extras };
}

export function successState(message: string): ActionState {
  return { status: "success", message };
}

/** Reads a string field from FormData, treating anything else as empty. */
export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
