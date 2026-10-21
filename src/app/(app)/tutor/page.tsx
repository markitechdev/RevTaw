import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AssistantLauncher } from "@/components/assistant/assistant-provider";
import { Alert } from "@/components/forms/form-alert";
import { formatRelativeDate } from "@/components/materials/material-card";
import { NewConversationButton } from "@/components/tutor/new-conversation-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listMaterials } from "@/lib/materials/queries";
import { routes } from "@/lib/routes";
import { listConversations } from "@/lib/tutor/queries";
import { TUTOR_MODE_BY_ID } from "@/lib/tutor/types";

export const metadata: Metadata = {
  title: "AI Tutor",
};

export default async function TutorPage({ searchParams }: PageProps<"/tutor">) {
  const params = await searchParams;
  const [conversations, materials] = await Promise.all([listConversations(), listMaterials()]);
  const readyMaterials = materials.filter((material) => material.status === "ready").map((material) => ({ id: material.id, title: material.title, subject: material.subject?.name ?? null }));
  const notice = params.notice === "deleted" ? "The conversation was deleted." : null;

  return (
    <div className="flex flex-col gap-6">
      {/* The AI Tutor is the full-page version of Tamari's chat. */}
      <AssistantLauncher mode="hidden" />
      {notice && <Alert tone="success">{notice}</Alert>}
      <PageHeader
        title="AI Tutor"
        description="Ask about your materials and get answers that say which passage they come from. Highlight text in any material to ask about just that part."
        actions={<NewConversationButton materials={readyMaterials} size="sm" />}
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description={
            readyMaterials.length === 0
              ? "The tutor works best with a processed material to ground its answers. You can still ask general questions."
              : "Start with a material: explain, simplify, example, analogy, quiz me, or guide me without the answer."
          }
          action={<NewConversationButton materials={readyMaterials} size="sm">Ask the tutor</NewConversationButton>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{TUTOR_MODE_BY_ID[conversation.mode].label}</Badge>
                  {conversation.session_id && <Badge tone="neutral">Study session</Badge>}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`${routes.tutor}/${conversation.id}`} className="line-clamp-2 font-medium text-foreground hover:underline">
                    {conversation.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.material?.title ?? "General questions"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {conversation.message_count} message{conversation.message_count === 1 ? "" : "s"}
                  {conversation.last_message_at ? ` · ${formatRelativeDate(conversation.last_message_at)}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {readyMaterials.length > 0 && conversations.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Tip: open a material&apos;s <Link href={routes.materials} className={buttonClasses({ variant: "link", size: "sm" })}>Content tab</Link>, select a sentence and choose Explain, Quiz me or Ask why.
        </p>
      )}
    </div>
  );
}
