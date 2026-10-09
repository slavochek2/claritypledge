/**
 * @file suggest-source-dialog.tsx
 * @description P1447: "Suggest a source" on /cm. A one-link form (optional short note) that anyone,
 * signed in or not, can send. The link is stored for the founder to review and is never fetched,
 * previewed or published from here — the confirmation says so plainly.
 */
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  looksLikeSourceUrl,
  SOURCE_NOTE_MAX,
  SOURCE_URL_MAX,
  submitCalendarSource,
  type SubmitSourceResult,
} from "@/app/data/calendar-sources";

type Phase = "editing" | "saving" | "saved";

const ERROR_TEXT: Record<Exclude<SubmitSourceResult, "ok">, string> = {
  "invalid-link": "That doesn't look like a web link. Paste the full address, starting with https://",
  "rate-limited": "Lots of suggestions came in this hour. Please try again a little later.",
  failed: "Something went wrong and it wasn't sent. Please try again.",
};

export function SuggestSourceDialog() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("editing");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && phase === "saved") {
      setPhase("editing");
      setUrl("");
      setNote("");
    }
    if (!next) setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeSourceUrl(url)) {
      setError(ERROR_TEXT["invalid-link"]);
      return;
    }
    setError(null);
    setPhase("saving");
    const result = await submitCalendarSource(url, note);
    if (result === "ok") {
      setPhase("saved");
    } else {
      setPhase("editing");
      setError(ERROR_TEXT[result]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Suggest a source"
          data-testid="cm-suggest-source"
          className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-md px-1 text-sm sm:px-2 font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
        >
          {/* A bare "+" on phones read as the embedded calendar's own add-event button. */}
          <Plus className="hidden h-4 w-4 sm:block" aria-hidden="true" />
          <span className="sm:hidden">Suggest</span>
          <span className="hidden sm:inline">Suggest a source</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {phase === "saved" ? (
          <div data-testid="cm-suggest-source-saved">
            <DialogHeader>
              <DialogTitle>Thanks, it's on the list</DialogTitle>
              <DialogDescription>
                We look through suggestions regularly and add the ones that fit the calendar.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>Suggest a source</DialogTitle>
              <DialogDescription>
                Know a page or group that lists Chiang Mai events? Send us the link.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label htmlFor="cm-source-url" className="text-sm font-medium">
                  Link
                </label>
                <Input
                  id="cm-source-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://"
                  maxLength={SOURCE_URL_MAX}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-invalid={error !== null}
                  aria-describedby={error ? "cm-source-error" : undefined}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cm-source-note" className="text-sm font-medium">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="cm-source-note"
                  rows={2}
                  maxLength={SOURCE_NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {error && (
                <p id="cm-source-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                disabled={phase === "saving"}
                className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-700"
              >
                {phase === "saving" ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
