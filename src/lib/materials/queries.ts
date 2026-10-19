import "server-only";

import { cache } from "react";

import { parseAnalysisData, type AnalysisData } from "@/lib/materials/analysis-schema";
import type { Folder, Material, MaterialAnalysis, MaterialChunk, Subject } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type SubjectWithFolders = Pick<Subject, "id" | "name" | "color" | "archived_at"> & {
  folders: Pick<Folder, "id" | "name" | "position">[];
  materialCount: number;
};

export type MaterialListItem = Pick<
  Material,
  | "id"
  | "title"
  | "source"
  | "status"
  | "status_detail"
  | "subject_id"
  | "folder_id"
  | "file_size"
  | "page_count"
  | "word_count"
  | "archived_at"
  | "created_at"
  | "updated_at"
  | "last_opened_at"
> & {
  subject: { id: string; name: string; color: string | null } | null;
  folder: { id: string; name: string } | null;
};

const MATERIAL_LIST_COLUMNS =
  "id, title, source, status, status_detail, subject_id, folder_id, file_size, page_count, word_count, archived_at, created_at, updated_at, last_opened_at, " +
  "subject:subjects!materials_subject_fk(id, name, color), folder:folders!materials_folder_fk(id, name)";

/** Subjects (with their folders) for pickers and the materials sidebar. */
export const listSubjects = cache(async (): Promise<SubjectWithFolders[]> => {
  const supabase = await createClient();
  const [{ data: subjects, error }, { data: folders }, { data: counts }] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, color, archived_at")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("folders")
      .select("id, subject_id, name, position")
      .is("archived_at", null)
      .order("position")
      .order("name"),
    supabase.from("materials").select("subject_id").is("archived_at", null),
  ]);

  if (error) {
    console.error("subjects: list failed", error.message);
    return [];
  }

  const countBySubject = new Map<string, number>();
  for (const row of counts ?? []) {
    if (row.subject_id) countBySubject.set(row.subject_id, (countBySubject.get(row.subject_id) ?? 0) + 1);
  }

  return (subjects ?? []).map((subject) => ({
    ...subject,
    folders: (folders ?? [])
      .filter((folder) => folder.subject_id === subject.id)
      .map(({ id, name, position }) => ({ id, name, position })),
    materialCount: countBySubject.get(subject.id) ?? 0,
  }));
});

export type MaterialFilters = {
  subjectId?: string | null;
  folderId?: string | null;
  archived?: boolean;
  search?: string;
};

export async function listMaterials(filters: MaterialFilters = {}): Promise<MaterialListItem[]> {
  const supabase = await createClient();
  let query = supabase.from("materials").select(MATERIAL_LIST_COLUMNS).order("updated_at", { ascending: false }).limit(200);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.folderId) query = query.eq("folder_id", filters.folderId);
  if (filters.search) query = query.ilike("title", `%${escapeLike(filters.search)}%`);

  const { data, error } = await query;
  if (error) {
    console.error("materials: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as MaterialListItem[];
}

export const countMaterials = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("materials")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);
  return count ?? 0;
});

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export type MaterialDetail = Material & {
  subject: { id: string; name: string; color: string | null } | null;
  folder: { id: string; name: string } | null;
};

export type MaterialChunkView = Pick<
  MaterialChunk,
  "id" | "position" | "heading" | "page_start" | "page_end" | "content" | "char_count"
>;

const MATERIAL_DETAIL_COLUMNS =
  "*, subject:subjects!materials_subject_fk(id, name, color), folder:folders!materials_folder_fk(id, name)";

/** One material with its organisation; null when it does not exist or is not the user's. */
export const getMaterial = cache(async (materialId: string): Promise<MaterialDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select(MATERIAL_DETAIL_COLUMNS)
    .eq("id", materialId)
    .maybeSingle();
  if (error) {
    console.error("materials: get failed", error.message);
    return null;
  }
  return (data as unknown as MaterialDetail | null) ?? null;
});

export const getMaterialChunks = cache(async (materialId: string): Promise<MaterialChunkView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_chunks")
    .select("id, position, heading, page_start, page_end, content, char_count")
    .eq("material_id", materialId)
    .order("position");
  if (error) {
    console.error("material_chunks: list failed", error.message);
    return [];
  }
  return data ?? [];
});

export type MaterialAnalysisView = {
  summary: string;
  difficulty: MaterialAnalysis["difficulty"];
  estimatedStudyMinutes: number;
  coverageRatio: number;
  provider: string;
  model: string;
  updatedAt: string;
  data: AnalysisData;
};

export const getMaterialAnalysis = cache(async (materialId: string): Promise<MaterialAnalysisView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_analyses")
    .select("summary, difficulty, estimated_study_minutes, coverage_ratio, provider, model, updated_at, data")
    .eq("material_id", materialId)
    .maybeSingle();
  if (error) {
    console.error("material_analyses: get failed", error.message);
    return null;
  }
  if (!data) return null;
  return {
    summary: data.summary,
    difficulty: data.difficulty,
    estimatedStudyMinutes: data.estimated_study_minutes,
    coverageRatio: Number(data.coverage_ratio),
    provider: data.provider,
    model: data.model,
    updatedAt: data.updated_at,
    data: parseAnalysisData(data.data),
  };
});
