import type { Metadata } from "next";

import { MyConversations } from "@/components/my-conversations";
import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "השיחות שלי | Strauss Drive",
};

export default function MyConversationsPage() {
  return (
    <>
      <Topbar step={null} active="" />
      <MyConversations />
    </>
  );
}
