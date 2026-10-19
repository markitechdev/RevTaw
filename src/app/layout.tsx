import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevTaw",
  description: "Reviewer na may Bitaw. A reviewer that delivers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
