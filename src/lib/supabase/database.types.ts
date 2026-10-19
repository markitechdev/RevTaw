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

export type MaterialSource = "pdf" | "docx" | "doc" | "image" | "text";

export type MaterialStatus = "uploading" | "extracting" | "analyzing" | "ready" | "failed";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

type ProfilesRow = {
  id: string;
  display_name: string;
  education_level: EducationLevel | null;
  main_goal: StudyGoal | null;
  preferred_session_minutes: number | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SubjectsRow = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type FoldersRow = {
  id: string;
  user_id: string;
  subject_id: string;
  name: string;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialsRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  folder_id: string | null;
  title: string;
  source: MaterialSource;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  content_hash: string | null;
  status: MaterialStatus;
  status_detail: string | null;
  processing_attempts: number;
  last_processed_at: string | null;
  page_count: number | null;
  word_count: number | null;
  last_opened_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialChunksRow = {
  id: string;
  material_id: string;
  user_id: string;
  position: number;
  heading: string | null;
  page_start: number | null;
  page_end: number | null;
  content: string;
  char_count: number;
};

type MaterialAnalysesRow = {
  material_id: string;
  user_id: string;
  summary: string;
  difficulty: DifficultyLevel;
  estimated_study_minutes: number;
  coverage_ratio: number;
  data: Json;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
};

/** Insert/Update variants: every column optional except what the DB requires. */
type Writable<Row, Required extends keyof Row = never> = Partial<Row> & Pick<Row, Required>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: Writable<ProfilesRow, "id">;
        Update: Partial<ProfilesRow>;
        Relationships: [];
      };
      subjects: {
        Row: SubjectsRow;
        Insert: Writable<SubjectsRow, "name">;
        Update: Partial<SubjectsRow>;
        Relationships: [];
      };
      folders: {
        Row: FoldersRow;
        Insert: Writable<FoldersRow, "subject_id" | "name">;
        Update: Partial<FoldersRow>;
        Relationships: [
          {
            foreignKeyName: "folders_subject_fk";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      materials: {
        Row: MaterialsRow;
        Insert: Writable<MaterialsRow, "title" | "source">;
        Update: Partial<MaterialsRow>;
        Relationships: [
          {
            foreignKeyName: "materials_subject_fk";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "materials_folder_fk";
            columns: ["folder_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      material_chunks: {
        Row: MaterialChunksRow;
        Insert: Writable<MaterialChunksRow, "material_id" | "position" | "content" | "char_count">;
        Update: Partial<MaterialChunksRow>;
        Relationships: [
          {
            foreignKeyName: "material_chunks_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      material_analyses: {
        Row: MaterialAnalysesRow;
        Insert: Writable<
          MaterialAnalysesRow,
          "material_id" | "summary" | "difficulty" | "estimated_study_minutes" | "provider" | "model"
        >;
        Update: Partial<MaterialAnalysesRow>;
        Relationships: [
          {
            foreignKeyName: "material_analyses_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      education_level: EducationLevel;
      study_goal: StudyGoal;
      material_source: MaterialSource;
      material_status: MaterialStatus;
      difficulty_level: DifficultyLevel;
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
export type Subject = Tables<"subjects">;
export type Folder = Tables<"folders">;
export type Material = Tables<"materials">;
export type MaterialChunk = Tables<"material_chunks">;
export type MaterialAnalysis = Tables<"material_analyses">;
