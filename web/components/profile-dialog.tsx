"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { ProfileCard } from "@/components/profile-card";
import type { ConversationState } from "@/lib/api/use-conversation";

/**
 * "Edit my details" over the comparison: the same card as while collecting. A saved change recomputes
 * the comparison behind it (PATCH /profile), exactly like telling the advisor in the chat.
 */
export function ProfileDialog({
  open,
  onOpenChange,
  conversationId,
  profile,
  missing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  profile: ConversationState["profile"];
  missing: ConversationState["missing"];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-navy/40" />
        <Dialog.Popup className="fixed inset-y-4 end-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2 outline-none">
          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-2 shadow-card">
            <Dialog.Title className="text-base font-extrabold">עריכת הפרטים שלי</Dialog.Title>
            <Dialog.Close
              aria-label="סגירה"
              className="inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-muted"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <ProfileCard
            conversationId={conversationId}
            profile={profile}
            missing={missing}
            recalculates
            className="min-h-0 flex-1"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
