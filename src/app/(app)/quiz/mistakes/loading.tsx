import { ListPageSkeleton } from "@/components/ui/skeleton";

/** The mistake notebook: a column of mistakes. */
export default function MistakesLoading() {
  return <ListPageSkeleton rows={5} actions={3} />;
}
