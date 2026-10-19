import { z } from "zod";

import {
  EDUCATION_LEVELS,
  SESSION_CUSTOM,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_PRESETS,
  STUDY_GOALS,
} from "@/lib/profile/options";
import { displayNameSchema } from "@/lib/validation/auth";

const educationLevelSchema = z.enum(
  EDUCATION_LEVELS.map((item) => item.value) as [string, ...string[]],
  { message: "Choose your education level." },
);

const studyGoalSchema = z.enum(
  STUDY_GOALS.map((item) => item.value) as [string, ...string[]],
  { message: "Choose your main goal." },
);

/**
 * Session duration arrives as two fields: a preset radio (`sessionChoice`)
 * and an optional number used when the choice is "custom".
 */
export const sessionDurationSchema = z
  .object({
    sessionChoice: z
      .string({ message: "Choose a session length." })
      .min(1, "Choose a session length."),
    customMinutes: z.string().optional(),
  })
  .transform((value, ctx) => {
    if (value.sessionChoice === SESSION_CUSTOM) {
      const minutes = Number.parseInt(value.customMinutes ?? "", 10);
      if (!Number.isInteger(minutes)) {
        ctx.addIssue({
          code: "custom",
          path: ["customMinutes"],
          message: "Enter how many minutes you want to study.",
        });
        return z.NEVER;
      }
      if (minutes < SESSION_MIN_MINUTES || minutes > SESSION_MAX_MINUTES) {
        ctx.addIssue({
          code: "custom",
          path: ["customMinutes"],
          message: `Choose between ${SESSION_MIN_MINUTES} and ${SESSION_MAX_MINUTES} minutes.`,
        });
        return z.NEVER;
      }
      return minutes;
    }

    const preset = Number.parseInt(value.sessionChoice, 10);
    if (!SESSION_PRESETS.includes(preset as (typeof SESSION_PRESETS)[number])) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionChoice"],
        message: "Choose a session length.",
      });
      return z.NEVER;
    }
    return preset;
  });

export const studyPreferencesSchema = z.object({
  educationLevel: educationLevelSchema,
  mainGoal: studyGoalSchema,
  session: sessionDurationSchema,
});

export const profileDetailsSchema = z.object({
  displayName: displayNameSchema,
});

export const deleteAccountSchema = z.object({
  password: z
    .string({ message: "Enter your password to confirm." })
    .min(1, "Enter your password to confirm."),
  confirmation: z.literal("DELETE", {
    message: 'Type "DELETE" to confirm.',
  }),
});
