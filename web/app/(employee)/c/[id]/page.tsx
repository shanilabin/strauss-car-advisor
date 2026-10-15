import { Suspense } from "react";

import { ConversationView } from "@/components/chat/conversation-view";
import { Topbar } from "@/components/topbar";

/**
 * Conversation screen. Params are async in Next 16; awaiting them (and the
 * client view that loads dynamic data) stays under Suspense so cacheComponents
 * can stream the static shell first.
 */
export default function ConversationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<ConversationFallback />}>
      <ConversationLoader params={params} />
    </Suspense>
  );
}

async function ConversationLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConversationView key={id} conversationId={id} />;
}

function ConversationFallback() {
  return (
    <>
      <Topbar step={null} />
      <main className="flex flex-1 items-center justify-center px-5 py-16 text-muted-foreground">
        טוען את השיחה…
      </main>
    </>
  );
}
