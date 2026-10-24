import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssistantLauncher } from "@/components/assistant/assistant-provider";
import { ConversationActions } from "@/components/tutor/conversation-actions";
import { TutorChat } from "@/components/tutor/tutor-chat";
import { getConversation } from "@/lib/tutor/queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const conversation = await getConversation(id);
  return { title: conversation?.title ?? "Ask Tamari" };
}

export default async function ConversationPage({ params }: PageProps<"/tutor/[id]">) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) notFound();

  return (
    <div className="flex flex-col gap-3">
      <AssistantLauncher mode="hidden" />
      <TutorChat key={conversation.id} conversation={conversation} />
      {!conversation.session_id && <ConversationActions conversationId={conversation.id} title={conversation.title} />}
    </div>
  );
}
