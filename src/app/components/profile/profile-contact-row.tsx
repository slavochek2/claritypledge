/**
 * @file profile-contact-row.tsx
 * @description P1556: the handle, and either "My code" (owner) or "Message" (someone who may be messaged).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { canMessageProfile } from "@/app/data/contact-code-service";
import { startDm } from "@/app/data/chat-service";
import { chatPath } from "@/app/pages/chat/chat-view-model";
import { ContactCodeSheet } from "@/app/components/chat/contact-code-sheet";

// [FOUNDER DECISION: copy]
const COPY = {
  handleCopied: "Handle copied",
  handleCopyFailed: "Could not copy the handle.",
  myCode: "My code",
  message: "Message",
  messageFailed: "Could not start this chat. Try again.",
};

export function ProfileContactRow({
  profileId,
  slug,
  isOwner,
}: {
  profileId: string;
  slug: string | null;
  isOwner: boolean;
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const signedIn = !!session;
  const [canMessage, setCanMessage] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setCanMessage(false);
    if (isOwner || !signedIn) return;
    let live = true;
    canMessageProfile(profileId).then(
      (ok) => live && setCanMessage(ok),
      () => live && setCanMessage(false),
    );
    return () => {
      live = false;
    };
  }, [profileId, isOwner, signedIn]);

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(`@${slug}`);
      toast.success(COPY.handleCopied);
    } catch {
      toast.error(COPY.handleCopyFailed);
    }
  };

  const message = async () => {
    setStarting(true);
    try {
      navigate(chatPath(await startDm(profileId)));
    } catch {
      toast.error(COPY.messageFailed);
      setStarting(false);
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {slug && (
        <button
          type="button"
          data-testid="profile-handle"
          onClick={() => void copyHandle()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          @{slug}
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {isOwner && (
        <>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setCodeOpen(true)}
          >
            <QrCode className="mr-2 h-4 w-4" aria-hidden="true" />
            {COPY.myCode}
          </Button>
          <ContactCodeSheet open={codeOpen} onOpenChange={setCodeOpen} />
        </>
      )}
      {!isOwner && canMessage && (
        <Button
          data-testid="profile-message"
          className="min-h-11"
          disabled={starting}
          onClick={() => void message()}
        >
          {COPY.message}
        </Button>
      )}
    </div>
  );
}
