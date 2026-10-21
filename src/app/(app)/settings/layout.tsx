import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile and account, and how RevTaw looks, talks and reminds you.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[12rem_1fr] sm:gap-8">
        <SettingsNav />
        <div className="min-w-0 max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
