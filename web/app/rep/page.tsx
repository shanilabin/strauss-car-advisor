import type { Metadata } from "next";

import { RepScreen } from "@/components/rep-screen";

export const metadata: Metadata = {
  title: "תור הנציג | יועץ הרכב של שטראוס",
  robots: { index: false, follow: false },
};

export default function RepHome() {
  return <RepScreen />;
}
