import type { Metadata } from "next";

import { AppearanceForm } from "@/components/settings/appearance-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Appearance",
};

export default function AppearanceSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Make RevTaw yours: light or dark, your color, and how much things move.</CardDescription>
      </CardHeader>
      <CardContent>
        <AppearanceForm />
      </CardContent>
    </Card>
  );
}
