import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Logo withTagline />
        <ThemeToggle />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{BRAND.motto}</CardTitle>
          <CardDescription>{BRAND.tagline}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Start Studying</Button>
          <Button variant="secondary">See How RevTaw Works</Button>
          <Badge tone="success">Mastered</Badge>
          <Badge tone="warning">Needs review</Badge>
        </CardContent>
      </Card>
    </main>
  );
}
