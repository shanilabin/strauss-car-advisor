import type { Metadata, Viewport } from "next";
import { Heebo, Secular_One } from "next/font/google";
import Link from "next/link";

import { ApiStatus } from "@/components/api-status";
import { ThemeSync } from "@/components/theme-sync";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

const secularOne = Secular_One({
  variable: "--font-secular-one",
  weight: "400",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "Strauss Drive",
  description: "מה יקרה לנטו שלי? השוואת חלופות רכב חברה, מוסברת ומדויקת",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Shrink the layout when the keyboard opens so the chat field stays visible.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${secularOne.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh min-w-0 flex-col overflow-x-clip font-sans">
        <ThemeSync />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-(--topbar-h)">{children}</div>
        <footer
          id="app-footer"
          className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5 lg:px-8"
        >
          <ApiStatus />
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            מדיניות פרטיות
          </Link>
        </footer>
      </body>
    </html>
  );
}
