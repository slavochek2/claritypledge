/**
 * @file contact-code-sheet.tsx
 * @description P1556: "My code". The signed-in person's QR and link; anyone who opens it can message them.
 * Reset replaces the token (old links stop working) behind an inline confirmation, never a browser confirm().
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth";
import { analytics } from "@/lib/mixpanel";
import { cn } from "@/lib/utils";
import {
  contactCodeUrl,
  getMyContactCode,
  resetMyContactCode,
} from "@/app/data/contact-code-service";
import { FOCUS_RING, PersonMark } from "@/app/pages/chat/chat-kit";

// [FOUNDER DECISION: copy]
const COPY = {
  title: "My code",
  description: "Your personal code and link for starting a chat with you.",
  caption: "Anyone with this code can message you.",
  loading: "Loading…",
  error: "Could not load your code.",
  retry: "Retry",
  copyLink: "Copy link",
  copied: "Copied",
  copyFailed: "Could not copy. Select the link and copy it.",
  share: "Share",
  shareText: "Message me on Clarity Pledge",
  resetOpen: "Reset code",
  resetWarning: "Old links and printed codes will stop working.",
  reset: "Reset",
  cancel: "Cancel",
  resetFailed: "Could not reset your code. Try again.",
  resetDone: "Code reset",
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; token: string };

export function ContactCodeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    // The QR is the bearer link: a session replay must not capture it (profile pages are recorded).
    analytics.stopSessionRecording();
    let live = true;
    setState({ status: "loading" });
    setConfirming(false);
    getMyContactCode().then(
      (token) => live && setState({ status: "ready", token }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [open, attempt]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const url = state.status === "ready" ? contactCodeUrl(state.token) : "";

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(COPY.copied);
    } catch {
      toast.error(COPY.copyFailed);
    }
  }, [url]);

  const share = async () => {
    if (typeof navigator.share !== "function") return copy();
    try {
      await navigator.share({ title: COPY.title, text: COPY.shareText, url });
    } catch (e) {
      // The person closing the share sheet is not a failure.
      if (!(e instanceof DOMException && e.name === "AbortError")) void copy();
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      const token = await resetMyContactCode();
      setState({ status: "ready", token });
      setConfirming(false);
      toast.success(COPY.resetDone);
    } catch {
      toast.error(COPY.resetFailed);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm gap-0 p-0"
        hideCloseButton
        data-testid="contact-code-sheet"
      >
        <DialogHeader className="flex min-h-14 flex-row items-center justify-between gap-2 space-y-0 border-b px-4 py-2 text-left">
          <DialogTitle className="min-w-0 truncate text-base">
            {COPY.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {COPY.description}
          </DialogDescription>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className={cn(
                "-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 px-4 py-5">
          {user && <OwnerLine user={user} />}
          {state.status === "loading" && (
            <p role="status" className="py-12 text-sm text-muted-foreground">
              {COPY.loading}
            </p>
          )}
          {state.status === "error" && (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground"
            >
              <p>{COPY.error}</p>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setAttempt((n) => n + 1)}
              >
                {COPY.retry}
              </Button>
            </div>
          )}
          {state.status === "ready" && (
            <>
              <div
                className="rounded-lg border border-border bg-white p-4"
                data-testid="contact-code-qr"
              >
                <QRCodeSVG value={url} size={200} marginSize={1} />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {COPY.caption}
              </p>
              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() => void copy()}
                >
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                  {copied ? COPY.copied : COPY.copyLink}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() => void share()}
                >
                  <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {COPY.share}
                </Button>
              </div>
              <ResetControl
                confirming={confirming}
                resetting={resetting}
                onAsk={() => setConfirming(true)}
                onCancel={() => setConfirming(false)}
                onReset={() => void reset()}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SheetUser = { name: string; slug?: string | null; avatarUrl?: string | null; avatarColor?: string | null; hasPledged?: boolean | null };

function OwnerLine({ user }: { user: SheetUser }) {
  return (
    <div className="flex items-center gap-3">
      <PersonMark
        person={{ name: user.name, avatarUrl: user.avatarUrl, avatarColor: user.avatarColor, hasPledged: user.hasPledged ?? undefined }}
        size="md"
      />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-foreground">{user.name}</p>
        {user.slug && <p className="truncate text-xs text-muted-foreground">@{user.slug}</p>}
      </div>
    </div>
  );
}

function ResetControl({ confirming, resetting, onAsk, onCancel, onReset }: {
  confirming: boolean;
  resetting: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        className={cn("min-h-11 rounded px-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline", FOCUS_RING)}
      >
        {COPY.resetOpen}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-lg bg-muted p-3" role="group" aria-label={COPY.resetOpen}>
      <p className="text-center text-sm text-foreground">{COPY.resetWarning}</p>
      <div className="flex gap-2">
        <Button variant="destructive" className="min-h-11" disabled={resetting} onClick={onReset}>
          {COPY.reset}
        </Button>
        <Button variant="ghost" className="min-h-11" disabled={resetting} onClick={onCancel}>
          {COPY.cancel}
        </Button>
      </div>
    </div>
  );
}
