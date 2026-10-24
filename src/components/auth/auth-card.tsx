import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PAGE_TITLE } from "@/components/ui/typography";

/** Consistent frame for every authentication screen. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className={PAGE_TITLE}>{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <Card>
        <CardContent className="p-6">{children}</CardContent>
      </Card>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
