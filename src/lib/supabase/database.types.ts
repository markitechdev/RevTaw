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

export type ReviewerKind =
  | "complete"
  | "summary"
  | "bullet_notes"
  | "key_concepts"
  | "definitions"
  | "formula_sheet"
  | "qa"
  | "cornell"
  | "cheat_sheet"
  | "exam_reviewer";

export type GenerationStatus = "generating" | "ready" | "failed";

export type QuestionType =
  | "identification"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "essay"
  | "scenario"
  | "case_based"
  | "problem_solving";

export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuizMode = "practice" | "exam";
export type AttemptStatus = "in_progress" | "submitted";
export type ConfidenceLevel = "guessing" | "unsure" | "somewhat_confident" | "very_confident";
export type MistakeType =
  | "misunderstood_concept"
  | "forgotten_information"
  | "calculation_error"
  | "misread_question"
  | "confused_concepts"
  | "unclassified";

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

type ConceptsRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  material_id: string | null;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
};

type ReviewersRow = {
  id: string;
  user_id: string;
  material_id: string;
  kind: ReviewerKind;
  title: string;
  status: GenerationStatus;
  status_detail: string | null;
  provider: string | null;
  model: string | null;
  last_opened_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewerSectionsRow = {
  id: string;
  reviewer_id: string;
  user_id: string;
  position: number;
  heading: string;
  content: string;
  edited_at: string | null;
  regenerated_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuizzesRow = {
  id: string;
  user_id: string;
  material_id: string;
  title: string;
  config: Json;
  status: GenerationStatus;
  status_detail: string | null;
  provider: string | null;
  model: string | null;
  question_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuizQuestionsRow = {
  id: string;
  quiz_id: string;
  user_id: string;
  position: number;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  prompt: string;
  options: Json | null;
  answer: Json;
  explanation: string | null;
  concept_id: string | null;
  source_excerpt: string | null;
  source_chunk_id: string | null;
  points: number;
  created_at: string;
};

type QuizAttemptsRow = {
  id: string;
  quiz_id: string;
  user_id: string;
  mode: QuizMode;
  status: AttemptStatus;
  time_limit_seconds: number | null;
  question_order: Json;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  correct_count: number | null;
  question_count: number;
  created_at: string;
  updated_at: string;
};

type QuizAnswersRow = {
  id: string;
  attempt_id: string;
  question_id: string;
  user_id: string;
  response: Json | null;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  graded_by: "auto" | "ai" | "self" | null;
  confidence: ConfidenceLevel | null;
  response_ms: number | null;
  answered_at: string;
  updated_at: string;
};

type MistakesRow = {
  id: string;
  user_id: string;
  question_id: string | null;
  attempt_id: string | null;
  concept_id: string | null;
  material_id: string | null;
  question_text: string;
  student_answer: string | null;
  correct_answer: string;
  explanation: string | null;
  error_type: MistakeType;
  resolved_at: string | null;
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
      concepts: {
        Row: ConceptsRow;
        Insert: Writable<ConceptsRow, "name" | "normalized_name">;
        Update: Partial<ConceptsRow>;
        Relationships: [
          {
            foreignKeyName: "concepts_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      reviewers: {
        Row: ReviewersRow;
        Insert: Writable<ReviewersRow, "material_id" | "kind" | "title">;
        Update: Partial<ReviewersRow>;
        Relationships: [
          {
            foreignKeyName: "reviewers_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      reviewer_sections: {
        Row: ReviewerSectionsRow;
        Insert: Writable<ReviewerSectionsRow, "reviewer_id" | "position" | "heading" | "content">;
        Update: Partial<ReviewerSectionsRow>;
        Relationships: [
          {
            foreignKeyName: "reviewer_sections_reviewer_fk";
            columns: ["reviewer_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "reviewers";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      quizzes: {
        Row: QuizzesRow;
        Insert: Writable<QuizzesRow, "material_id" | "title">;
        Update: Partial<QuizzesRow>;
        Relationships: [
          {
            foreignKeyName: "quizzes_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      quiz_questions: {
        Row: QuizQuestionsRow;
        Insert: Writable<QuizQuestionsRow, "quiz_id" | "position" | "type" | "prompt" | "answer">;
        Update: Partial<QuizQuestionsRow>;
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_fk";
            columns: ["quiz_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "quiz_questions_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      quiz_attempts: {
        Row: QuizAttemptsRow;
        Insert: Writable<QuizAttemptsRow, "quiz_id">;
        Update: Partial<QuizAttemptsRow>;
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_fk";
            columns: ["quiz_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quizzes";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      quiz_answers: {
        Row: QuizAnswersRow;
        Insert: Writable<QuizAnswersRow, "attempt_id" | "question_id">;
        Update: Partial<QuizAnswersRow>;
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_fk";
            columns: ["attempt_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quiz_attempts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "quiz_answers_question_fk";
            columns: ["question_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quiz_questions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      mistakes: {
        Row: MistakesRow;
        Insert: Writable<MistakesRow, "question_text" | "correct_answer">;
        Update: Partial<MistakesRow>;
        Relationships: [
          {
            foreignKeyName: "mistakes_question_fk";
            columns: ["question_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quiz_questions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "mistakes_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "mistakes_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
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
      reviewer_kind: ReviewerKind;
      generation_status: GenerationStatus;
      question_type: QuestionType;
      question_difficulty: QuestionDifficulty;
      quiz_mode: QuizMode;
      attempt_status: AttemptStatus;
      confidence_level: ConfidenceLevel;
      mistake_type: MistakeType;
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
export type Concept = Tables<"concepts">;
export type Reviewer = Tables<"reviewers">;
export type ReviewerSection = Tables<"reviewer_sections">;
export type Quiz = Tables<"quizzes">;
export type QuizQuestion = Tables<"quiz_questions">;
export type QuizAttempt = Tables<"quiz_attempts">;
export type QuizAnswer = Tables<"quiz_answers">;
export type Mistake = Tables<"mistakes">;
