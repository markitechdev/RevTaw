import { z } from "zod";

import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/limits";

export { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/limits";

/**
 * Shared validation for authentication forms. Used on the server (Server
 * Actions) as the source of truth; browsers get the same limits through the
 * input attributes rendered by the forms (from `limits.ts`, without zod).
 */

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "welcome1",
  "abc12345",
  "letmein1",
  "trustno1",
  "passw0rd",
  "11111111",
  "00000000",
]);

export const emailSchema = z
  .string({ message: "Enter your email address." })
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email({ message: "Enter a valid email address." }))
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ message: "Enter a password." })
  .min(
    PASSWORD_MIN_LENGTH,
    `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  )
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
    "That password is too common. Choose something harder to guess.",
  );

export const displayNameSchema = z
  .string({ message: "Enter your name." })
  .trim()
  .min(1, "Enter your name.")
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  )
  .refine(
    (value) => !/[<>]/.test(value),
    "Names cannot contain < or > characters.",
  );

/** The sign-up agreement: the Terms of Use and the Privacy Notice (and, under 18, a parent's or guardian's). */
export const AGREEMENT_REQUIRED = "To create an account, agree to the Terms of Use and the Privacy Notice.";

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    agree: z.literal("yes", { message: AGREEMENT_REQUIRED }),
  })
  .refine(
    ({ email, password }) => {
      const local = email.split("@")[0] ?? "";
      return local.length < 4 || !password.toLowerCase().includes(local.toLowerCase());
    },
    { message: "Your password should not contain your email address.", path: ["password"] },
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ message: "Enter your password." }).min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string({ message: "Confirm your new password." }),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: "Enter your current password." })
      .min(1, "Enter your current password."),
    password: passwordSchema,
    confirmPassword: z.string({ message: "Confirm your new password." }),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine(({ currentPassword, password }) => currentPassword !== password, {
    message: "Choose a password you have not used before.",
    path: ["password"],
  });

/** Flattens Zod issues into `{ fieldName: firstMessage }`. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!(key in errors)) {
      errors[key] = issue.message;
    }
  }
  return errors;
}
