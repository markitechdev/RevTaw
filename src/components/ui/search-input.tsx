import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  /** "sm" for a filter inside a panel or a dialog. */
  size?: "sm" | "md";
  /** Classes for the wrapper (its width), as the input fills it. */
  wrapperClassName?: string;
};

/** A search or filter field: the shared Input (and its focus ring) with a search icon. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({ size = "md", className, wrapperClassName, ...props }, ref) => (
  <div className={cn("relative", wrapperClassName)}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <Input ref={ref} type="search" className={cn("pl-9", size === "sm" && "h-9", className)} {...props} />
  </div>
));
SearchInput.displayName = "SearchInput";
