import { Archive, FolderOpen, Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { z } from "zod";

import { Alert } from "@/components/forms/form-alert";
import { RestoreMaterialButton } from "@/components/materials/archive-controls";
import { ManageSubjectsButton } from "@/components/materials/manage-subjects-dialog";
import { MaterialCard } from "@/components/materials/material-card";
import { UploadButton } from "@/components/materials/upload-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { purgeMyExpiredMaterials } from "@/lib/materials/purge";
import { listMaterials, listSubjects } from "@/lib/materials/queries";
import { ARCHIVE_DAYS, ARCHIVE_RULE, KEPT_ITEMS } from "@/lib/materials/retention";
import { getCurrentUserWithProfile } from "@/lib/profile/queries";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Materials",
};

function param(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export default async function MaterialsPage({ searchParams }: PageProps<"/materials">) {
  const params = await searchParams;
  const subjectId = param(params.subject);
  const folderId = param(params.folder);
  const archived = params.archived === "1";
  const notice = param(params.notice);
  const movedId = z.uuid().safeParse(param(params.material)).data ?? null;

  const { user, profile } = await getCurrentUserWithProfile();
  // Archived materials past their 30 days are deleted permanently on the way (the scheduler does it too);
  // the Archive waits for it so it never lists one that is already due.
  if (user) {
    if (archived) await purgeMyExpiredMaterials(user.id);
    else after(purgeMyExpiredMaterials(user.id));
  }

  const [subjects, materials] = await Promise.all([
    listSubjects(),
    listMaterials({ subjectId, folderId, archived }),
  ]);

  const activeSubject = subjects.find((subject) => subject.id === subjectId) ?? null;
  const activeFolder = activeSubject?.folders.find((folder) => folder.id === folderId) ?? null;
  const totalMaterials = subjects.reduce((sum, subject) => sum + subject.materialCount, 0);

  const filterHref = (next: { subject?: string | null; folder?: string | null; archived?: boolean }) => {
    const query = new URLSearchParams();
    const subject = next.subject === undefined ? subjectId : next.subject;
    const folder = next.folder === undefined ? folderId : next.folder;
    const showArchived = next.archived === undefined ? archived : next.archived;
    if (subject) query.set("subject", subject);
    if (folder) query.set("folder", folder);
    if (showArchived) query.set("archived", "1");
    const string = query.toString();
    return string ? `${routes.materials}?${string}` : routes.materials;
  };

  return (
    <div className="flex flex-col gap-6">
      {notice === "archived" && (
        <Alert tone="success">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              Moved to the Archive. You can restore it there for {ARCHIVE_DAYS} days.{" "}
              <Link href={filterHref({ subject: null, folder: null, archived: true })} className="font-medium underline underline-offset-2">
                Open the Archive
              </Link>
            </span>
            {movedId && <RestoreMaterialButton materialId={movedId} label="Undo" then="open" />}
          </span>
        </Alert>
      )}
      {notice === "purged" && <Alert tone="success">Deleted permanently. {KEPT_ITEMS} made from it are still here.</Alert>}
      <PageHeader
        title="Materials"
        description="Everything you upload stays private to your account. RevTaw reads each file, finds its topics and gets it ready for reviewers, quizzes and study sessions."
        actions={<UploadButton subjects={subjects} initialSubjectId={subjectId} defaultOpen={params.upload === "1"} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="flex flex-col gap-1" aria-label="Subjects">
          <div className="mb-1 flex items-center justify-between pl-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Browse</h2>
            <ManageSubjectsButton subjects={subjects} />
          </div>
          <Link
            href={filterHref({ subject: null, folder: null })}
            aria-current={!subjectId && !archived ? "page" : undefined}
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
              !subjectId && !archived ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" aria-hidden="true" />
              All materials
            </span>
            <span className="text-xs">{totalMaterials}</span>
          </Link>

          {subjects.map((subject) => {
            const active = subject.id === subjectId;
            return (
              <div key={subject.id}>
                <Link
                  href={filterHref({ subject: subject.id, folder: null, archived: false })}
                  aria-current={active && !folderId ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                    active && !folderId ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: subject.color ?? "var(--primary)" }}
                    />
                    <span className="truncate">{subject.name}</span>
                  </span>
                  <span className="text-xs">{subject.materialCount}</span>
                </Link>
                {active && subject.folders.length > 0 && (
                  <ul className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                    {subject.folders.map((folder) => (
                      <li key={folder.id}>
                        <Link
                          href={filterHref({ subject: subject.id, folder: folder.id, archived: false })}
                          aria-current={folder.id === folderId ? "page" : undefined}
                          className={cn(
                            "block truncate rounded-md px-2 py-1.5 text-sm",
                            folder.id === folderId ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {folder.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <Link
            href={filterHref({ subject: null, folder: null, archived: !archived })}
            aria-current={archived ? "page" : undefined}
            className={cn(
              "mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              archived ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            Archive
          </Link>
        </aside>

        <section aria-label="Material list" className="min-w-0">
          {(activeSubject || archived) && (
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {archived
                ? "Archive"
                : activeFolder
                  ? `${activeSubject?.name} · ${activeFolder.name}`
                  : activeSubject?.name}
            </h2>
          )}

          {archived && materials.length > 0 && <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{ARCHIVE_RULE} {KEPT_ITEMS} made from them always stay.</p>}
          {materials.length === 0 ? (
            archived ? (
              <EmptyState
                icon={Archive}
                title="The Archive is empty"
                description={`${ARCHIVE_RULE} ${KEPT_ITEMS} made from them always stay.`}
              />
            ) : (
              <EmptyState
                icon={FolderOpen}
                title={activeSubject ? `Nothing in ${activeSubject.name} yet` : "Upload your first study material"}
                description="RevTaw can turn it into reviewers, quizzes, flashcards and personalized study sessions. PDFs, Word documents, photos of notes, or just paste text."
                action={<UploadButton subjects={subjects} initialSubjectId={subjectId} size="sm" />}
              />
            )
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {materials.map((material) => (
                <li key={material.id}>
                  <MaterialCard material={material} timeZone={profile?.timezone ?? undefined} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
