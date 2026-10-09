import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExplorerNotifications } from "@synehq-oos/explorer";
import { TooltipProvider } from "@synehq-oos/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SyneHQ OOS", template: "%s · SyneHQ OOS" },
  description:
    "A personal database explorer. Tables, schemas, relationships, and SQL in your browser.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider delayDuration={200}>
          {children}
          <ExplorerNotifications position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
