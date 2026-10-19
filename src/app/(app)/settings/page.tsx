import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

export default function SettingsIndexPage() {
  redirect(routes.settingsProfile);
}
