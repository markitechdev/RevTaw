import { DetailPageSkeleton } from "@/components/ui/skeleton";

/** A quiz: title, actions, then the start panel beside the attempts. */
export default function QuizLoading() {
  return <DetailPageSkeleton columns={2} />;
}
