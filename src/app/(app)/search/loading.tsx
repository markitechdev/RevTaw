import { ListPageSkeleton } from "@/components/ui/skeleton";

/** Search: the box and a column of results. */
export default function SearchLoading() {
  return <ListPageSkeleton rows={4} actions={0} />;
}
