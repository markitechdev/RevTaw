/**
 * Database types for the RevTaw Supabase project.
 *
 * Kept in sync by hand with `supabase/migrations/*.sql`. The shape follows the
 * output of `supabase gen types typescript`, so the file can be regenerated
 * with the CLI once the project is linked:
 *
 *   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EducationLevel =
  | "junior_high"
  | "senior_high"
  | "college"
  | "graduate"
  | "professional_review"
  | "other";

export type StudyGoal =
  | "improve_grades"
  | "review_lessons"
  | "prepare_quizzes"
  | "prepare_exams"
  | "memorize_information"
  | "understand_concepts"
  | "practice_problem_solving";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          education_level: EducationLevel | null;
          main_goal: StudyGoal | null;
          preferred_session_minutes: number | null;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          education_level?: EducationLevel | null;
          main_goal?: StudyGoal | null;
          preferred_session_minutes?: number | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          education_level?: EducationLevel | null;
          main_goal?: StudyGoal | null;
          preferred_session_minutes?: number | null;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      education_level: EducationLevel;
      study_goal: StudyGoal;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
