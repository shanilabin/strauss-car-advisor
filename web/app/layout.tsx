import type { Metadata } from "next";
import { Geist_Mono, Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-sans",
  subsets: ["hebrew", "latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "יועץ הרכב של שטראוס",
  description: "מה יקרה לנטו שלי? השוואת חלופות רכב חברה, מוסברת ומדויקת",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
