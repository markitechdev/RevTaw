import { AssistantPage } from "@/components/assistant/assistant-provider";
import { methodName } from "@/lib/study/catalog";
import { getSession } from "@/lib/study/queries";

/**
 * Every study session view tells Ask RevTaw which session it is (a running
 * one gets hints, not answers). The floating button stays off phones while a
 * session runs, so it never sits on top of the runner's buttons.
 */
export default async function SessionLayout({ children, params }: LayoutProps<"/study/[id]">) {
  const { id } = await params;
  const session = await getSession(id);
  return (
    <>
      {session && (
        <AssistantPage
          context={{ kind: "session", id: session.id }}
          label={`${methodName(session.method)} → ${session.material?.title ?? session.title}`}
          materialId={session.material_id}
          launcher={session.status === "in_progress" ? "desktop" : "visible"}
        />
      )}
      {children}
    </>
  );
}
