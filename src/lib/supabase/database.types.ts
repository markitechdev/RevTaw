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
export type SessionStatus = "in_progress" | "completed" | "abandoned";
export type SessionGoal = "memorize" | "understand" | "practice" | "exam_prep" | "quick_review" | "master_topic";
export type FlashcardRating = "again" | "hard" | "good" | "easy";
export type TutorMode = "tutor" | "guided" | "socratic" | "elaborative" | "self_explanation" | "teach_back";
export type SessionItemKind =
  | "recall"
  | "feynman"
  | "mistake"
  | "blurt"
  | "chunk"
  | "question"
  | "problem"
  | "scenario"
  | "case"
  | "stage"
  | "visual"
  | "link"
  | "mnemonic"
  | "loci"
  | "story";
export type StudyMapKind = "mind" | "concept" | "visual";
export type MnemonicKind = "acronym" | "acrostic" | "rhyme" | "phrase" | "association" | "story" | "custom";
export type TutorRole = "user" | "assistant";
export type MasteryStatus = "new" | "weak" | "learning" | "strong" | "mastered";
export type NextDifficulty = "easy" | "medium" | "hard" | "advanced";
export type ExamPriority = "low" | "normal" | "high";
export type PlanMode = "exam" | "cram";
export type PlanStatus = "active" | "completed" | "archived";
export type TaskKind = "plan" | "review" | "custom";
export type TaskStatus = "pending" | "done" | "skipped" | "missed";
export type GoalKind = "focus_minutes" | "flashcards_reviewed" | "questions_answered" | "mastery" | "finish_material";
export type GoalPeriod = "day" | "week" | "once";
export type GoalStatus = "active" | "completed" | "archived";
export type NotificationKind = "review_due" | "exam_upcoming" | "plan_reminder" | "plan_adjusted" | "daily_goal" | "streak" | "achievement" | "level_up" | "reminder";
/** Calendar category of a planner activity (0014). */
export type ActivityCategory = "study" | "review" | "assignment" | "project" | "exam" | "class" | "other";
/** When an activity reminds the student (0014); `custom` uses reminder_minutes. */
export type TaskReminder = "none" | "at_time" | "10m" | "30m" | "1h" | "1d" | "custom";
export type ReminderStatus = "pending" | "sent" | "cancelled";
export type XpSource = "answers" | "session" | "reviews" | "mastered" | "goal" | "streak_day" | "achievement";

type ProfilesRow = {
  id: string;
  display_name: string;
  education_level: EducationLevel | null;
  main_goal: StudyGoal | null;
  preferred_session_minutes: number | null;
  onboarding_completed_at: string | null;
  xp: number;
  timezone: string | null;
  /** Personal preferences by section; parse with `parsePreferences` (src/lib/preferences/schema.ts). */
  preferences: Json;
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
  /** BGE-M3 embedding as pgvector text ("[0.1,0.2,…]"); null until embedded (migration 0017). */
  embedding: string | null;
  embedding_model: string | null;
  embedded_at: string | null;
  /** Generated 'simple' full-text vector; never written. */
  search_tsv: string;
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
  search_text: string;
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

type StudySessionsRow = {
  id: string;
  user_id: string;
  material_id: string | null;
  subject_id: string | null;
  method: string;
  goal: SessionGoal | null;
  planned_minutes: number | null;
  title: string;
  status: SessionStatus;
  state: Json;
  summary: Json | null;
  focus_seconds: number;
  items_total: number;
  items_correct: number;
  items_incorrect: number;
  quiz_attempt_id: string | null;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type StudySessionItemsRow = {
  id: string;
  user_id: string;
  session_id: string;
  position: number;
  kind: SessionItemKind;
  concept_id: string | null;
  prompt: string;
  model_answer: string | null;
  key_points: Json;
  source_excerpt: string | null;
  source_mistake_id: string | null;
  response: string | null;
  analysis: Json | null;
  is_correct: boolean | null;
  score: number | null;
  confidence: ConfidenceLevel | null;
  response_ms: number | null;
  attempts: number;
  format: string | null;
  material_id: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

type FlashcardDecksRow = {
  id: string;
  user_id: string;
  material_id: string;
  title: string;
  status: GenerationStatus;
  status_detail: string | null;
  provider: string | null;
  model: string | null;
  card_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type FlashcardsRow = {
  id: string;
  user_id: string;
  deck_id: string;
  position: number;
  front: string;
  back: string;
  hint: string | null;
  concept_id: string | null;
  source_excerpt: string | null;
  favorite: boolean;
  suspended: boolean;
  box: number;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
  last_rating: FlashcardRating | null;
  created_at: string;
  updated_at: string;
  search_text: string;
};

type FlashcardReviewsRow = {
  id: string;
  user_id: string;
  card_id: string;
  session_id: string | null;
  rating: FlashcardRating;
  response_ms: number | null;
  box_before: number | null;
  box_after: number | null;
  interval_days: number | null;
  due_at: string | null;
  reviewed_at: string;
};

type TutorConversationsRow = {
  id: string;
  user_id: string;
  material_id: string | null;
  session_id: string | null;
  title: string;
  mode: TutorMode;
  message_count: number;
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type TutorMessagesRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  role: TutorRole;
  content: string;
  action: string | null;
  selection: string | null;
  grounding: "material" | "partial" | "general" | "not_found" | null;
  sources: Json;
  additional_explanation: string | null;
  follow_ups: Json;
  flashcard: Json | null;
  visual: Json | null;
  provider: string | null;
  model: string | null;
  created_at: string;
};

type ConceptMasteryRow = {
  id: string;
  user_id: string;
  concept_id: string;
  mastery: number;
  retrieval_strength: number;
  status: MasteryStatus;
  next_difficulty: NextDifficulty;
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;
  open_mistakes: number;
  misconceptions: number;
  underconfident: number;
  avg_confidence: number | null;
  avg_response_ms: number | null;
  trend: number;
  last_practiced_at: string | null;
  next_review_at: string | null;
  computed_at: string;
  created_at: string;
  updated_at: string;
};

type ExamsRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  exam_date: string;
  priority: ExamPriority;
  confidence: ConfidenceLevel | null;
  topics: string[];
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ExamMaterialsRow = {
  exam_id: string;
  material_id: string;
  user_id: string;
  position: number;
  created_at: string;
};

type StudyPlansRow = {
  id: string;
  user_id: string;
  exam_id: string;
  mode: PlanMode;
  status: PlanStatus;
  start_date: string;
  end_date: string;
  available_days: number[];
  minutes_per_day: number;
  settings: Json;
  generated_at: string;
  adjusted_at: string | null;
  adjustment_note: string | null;
  created_at: string;
  updated_at: string;
};

type StudyTasksRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  exam_id: string | null;
  material_id: string | null;
  kind: TaskKind;
  method: string;
  title: string;
  reason: string | null;
  scheduled_for: string;
  position: number;
  minutes: number;
  concepts: string[];
  status: TaskStatus;
  session_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** "HH:MM:SS" local time in the student's time zone, or null for any time that day. */
  starts_at: string | null;
  subject_id: string | null;
  priority: ExamPriority;
  notes: string | null;
  category: ActivityCategory | null;
  reminder: TaskReminder;
  reminder_minutes: number | null;
};

type RemindersRow = {
  id: string;
  user_id: string;
  task_id: string;
  remind_at: string;
  status: ReminderStatus;
  in_app_sent_at: string | null;
  email_sent_at: string | null;
  email_attempts: number;
  email_error: string | null;
  claimed_until: string | null;
  created_at: string;
  updated_at: string;
};

export type AiUsageKind = "chat" | "generate" | "study" | "upload" | "voice";

type AiUsageRow = {
  user_id: string;
  day: string;
  kind: AiUsageKind;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  updated_at: string;
};

type StudyGoalsRow = {
  id: string;
  user_id: string;
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  material_id: string | null;
  subject_id: string | null;
  title: string | null;
  due_date: string | null;
  status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RoutinesRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  blocks: Json;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationsRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
};

/** Insert/Update variants: every column optional except what the DB requires. */
type StudyMapsRow = {
  id: string;
  user_id: string;
  material_id: string | null;
  kind: StudyMapKind;
  title: string;
  data: Json;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

type MnemonicsRow = {
  id: string;
  user_id: string;
  material_id: string | null;
  concept_id: string | null;
  kind: MnemonicKind;
  target: string;
  items: string[];
  content: string;
  explanation: string | null;
  source: "ai" | "user";
  favorite: boolean;
  last_practiced_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryPalacesRow = {
  id: string;
  user_id: string;
  title: string;
  locations: Json;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type XpEventsRow = {
  id: string;
  user_id: string;
  source: XpSource;
  source_key: string;
  points: number;
  label: string | null;
  created_at: string;
};

type AchievementsRow = {
  id: string;
  user_id: string;
  key: string;
  unlocked_at: string;
  seen_at: string | null;
};

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
      study_sessions: {
        Row: StudySessionsRow;
        Insert: Writable<StudySessionsRow, "method" | "title">;
        Update: Partial<StudySessionsRow>;
        Relationships: [
          {
            foreignKeyName: "study_sessions_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_sessions_subject_fk";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_sessions_attempt_fk";
            columns: ["quiz_attempt_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "quiz_attempts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      study_session_items: {
        Row: StudySessionItemsRow;
        Insert: Writable<StudySessionItemsRow, "session_id" | "position" | "kind" | "prompt">;
        Update: Partial<StudySessionItemsRow>;
        Relationships: [
          {
            foreignKeyName: "study_session_items_session_fk";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_session_items_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_session_items_mistake_fk";
            columns: ["source_mistake_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "mistakes";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_session_items_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      flashcard_decks: {
        Row: FlashcardDecksRow;
        Insert: Writable<FlashcardDecksRow, "material_id" | "title">;
        Update: Partial<FlashcardDecksRow>;
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      flashcards: {
        Row: FlashcardsRow;
        Insert: Writable<FlashcardsRow, "deck_id" | "position" | "front" | "back">;
        Update: Partial<FlashcardsRow>;
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_fk";
            columns: ["deck_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "flashcard_decks";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "flashcards_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      tutor_conversations: {
        Row: TutorConversationsRow;
        Insert: Writable<TutorConversationsRow, "title">;
        Update: Partial<TutorConversationsRow>;
        Relationships: [
          {
            foreignKeyName: "tutor_conversations_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "tutor_conversations_session_fk";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      tutor_messages: {
        Row: TutorMessagesRow;
        Insert: Writable<TutorMessagesRow, "conversation_id" | "role" | "content">;
        Update: Partial<TutorMessagesRow>;
        Relationships: [
          {
            foreignKeyName: "tutor_messages_conversation_fk";
            columns: ["conversation_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tutor_conversations";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      concept_mastery: {
        Row: ConceptMasteryRow;
        Insert: Writable<ConceptMasteryRow, "concept_id">;
        Update: Partial<ConceptMasteryRow>;
        Relationships: [
          {
            foreignKeyName: "concept_mastery_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      flashcard_reviews: {
        Row: FlashcardReviewsRow;
        Insert: Writable<FlashcardReviewsRow, "card_id" | "rating">;
        Update: Partial<FlashcardReviewsRow>;
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_card_fk";
            columns: ["card_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "flashcards";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "flashcard_reviews_session_fk";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      exams: {
        Row: ExamsRow;
        Insert: Writable<ExamsRow, "title" | "exam_date">;
        Update: Partial<ExamsRow>;
        Relationships: [
          {
            foreignKeyName: "exams_subject_fk";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      exam_materials: {
        Row: ExamMaterialsRow;
        Insert: Writable<ExamMaterialsRow, "exam_id" | "material_id">;
        Update: Partial<ExamMaterialsRow>;
        Relationships: [
          {
            foreignKeyName: "exam_materials_exam_fk";
            columns: ["exam_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "exam_materials_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      study_plans: {
        Row: StudyPlansRow;
        Insert: Writable<StudyPlansRow, "exam_id" | "start_date" | "end_date">;
        Update: Partial<StudyPlansRow>;
        Relationships: [
          {
            foreignKeyName: "study_plans_exam_fk";
            columns: ["exam_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "exams";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      study_tasks: {
        Row: StudyTasksRow;
        Insert: Writable<StudyTasksRow, "method" | "title" | "scheduled_for">;
        Update: Partial<StudyTasksRow>;
        Relationships: [
          {
            foreignKeyName: "study_tasks_plan_fk";
            columns: ["plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "study_plans";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_tasks_exam_fk";
            columns: ["exam_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_tasks_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_tasks_session_fk";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      study_goals: {
        Row: StudyGoalsRow;
        Insert: Writable<StudyGoalsRow, "kind" | "target">;
        Update: Partial<StudyGoalsRow>;
        Relationships: [
          {
            foreignKeyName: "study_goals_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "study_goals_subject_fk";
            columns: ["subject_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      notifications: {
        Row: NotificationsRow;
        Insert: Writable<NotificationsRow, "kind" | "title" | "dedupe_key">;
        Update: Partial<NotificationsRow>;
        Relationships: [];
      };
      reminders: {
        Row: RemindersRow;
        Insert: Writable<RemindersRow, "task_id" | "remind_at">;
        Update: Partial<RemindersRow>;
        Relationships: [];
      };
      routines: {
        Row: RoutinesRow;
        Insert: Writable<RoutinesRow, "title">;
        Update: Partial<RoutinesRow>;
        Relationships: [];
      };
      study_maps: {
        Row: StudyMapsRow;
        Insert: Writable<StudyMapsRow, "kind" | "title">;
        Update: Partial<StudyMapsRow>;
        Relationships: [
          {
            foreignKeyName: "study_maps_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      mnemonics: {
        Row: MnemonicsRow;
        Insert: Writable<MnemonicsRow, "kind" | "target" | "content">;
        Update: Partial<MnemonicsRow>;
        Relationships: [
          {
            foreignKeyName: "mnemonics_material_fk";
            columns: ["material_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "materials";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "mnemonics_concept_fk";
            columns: ["concept_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      memory_palaces: {
        Row: MemoryPalacesRow;
        Insert: Writable<MemoryPalacesRow, "title">;
        Update: Partial<MemoryPalacesRow>;
        Relationships: [];
      };
      xp_events: {
        Row: XpEventsRow;
        Insert: Writable<XpEventsRow, "source" | "source_key" | "points">;
        Update: Partial<XpEventsRow>;
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsageRow;
        Insert: Writable<AiUsageRow, "user_id" | "day" | "kind">;
        Update: Partial<AiUsageRow>;
        Relationships: [];
      };
      achievements: {
        Row: AchievementsRow;
        Insert: Writable<AchievementsRow, "key">;
        Update: Partial<AchievementsRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_preference_section: {
        Args: { section_name: string; section_value: Json };
        Returns: Json;
      };
      claim_due_reminders: {
        Args: { batch_size?: number };
        Returns: RemindersRow[];
      };
      consume_ai_request: {
        Args: { p_kind: AiUsageKind; p_daily_limit: number };
        Returns: Array<{ allowed: boolean; used: number; daily_limit: number; resets_at: string; student_id: string }>;
      };
      add_ai_tokens: {
        Args: { p_kind: AiUsageKind; p_input_tokens: number; p_output_tokens: number };
        Returns: undefined;
      };
      refund_ai_request: {
        Args: { p_user_id: string; p_kind: AiUsageKind };
        Returns: undefined;
      };
      match_material_chunks: {
        Args: { query_text: string; keywords?: string | null; query_embedding?: string | null; only_material?: string | null; match_count?: number };
        Returns: Array<{ chunk_id: string; material_id: string; chunk_position: number; score: number }>;
      };
      save_chunk_embeddings: {
        Args: { items: Json; model: string };
        Returns: number;
      };
    };
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
      session_status: SessionStatus;
      session_goal: SessionGoal;
      flashcard_rating: FlashcardRating;
      tutor_mode: TutorMode;
      tutor_role: TutorRole;
      mastery_status: MasteryStatus;
      next_difficulty: NextDifficulty;
      exam_priority: ExamPriority;
      plan_mode: PlanMode;
      plan_status: PlanStatus;
      task_kind: TaskKind;
      task_status: TaskStatus;
      goal_kind: GoalKind;
      goal_period: GoalPeriod;
      goal_status: GoalStatus;
      notification_kind: NotificationKind;
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
export type StudySession = Tables<"study_sessions">;
export type StudySessionItem = Tables<"study_session_items">;
export type FlashcardDeck = Tables<"flashcard_decks">;
export type Flashcard = Tables<"flashcards">;
export type FlashcardReview = Tables<"flashcard_reviews">;
export type TutorConversation = Tables<"tutor_conversations">;
export type TutorMessage = Tables<"tutor_messages">;
export type ConceptMastery = Tables<"concept_mastery">;
export type Exam = Tables<"exams">;
export type ExamMaterial = Tables<"exam_materials">;
export type StudyPlan = Tables<"study_plans">;
export type StudyTask = Tables<"study_tasks">;
export type Reminder = Tables<"reminders">;
export type StudyGoalRow = Tables<"study_goals">;
export type Notification = Tables<"notifications">;
export type Routine = Tables<"routines">;
export type StudyMap = Tables<"study_maps">;
export type Mnemonic = Tables<"mnemonics">;
export type MemoryPalace = Tables<"memory_palaces">;
export type XpEvent = Tables<"xp_events">;
export type Achievement = Tables<"achievements">;
