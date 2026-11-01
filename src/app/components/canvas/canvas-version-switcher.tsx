/**
 * @file canvas-version-switcher.tsx
 * @description P1515 phase 5: the canvas's versions, newest first, for everyone the canvas admits; choosing one puts it in the address
 * (`?v=`). P1536: the open version reads "v{seq}" (the owner's open draft: "v{next}"; its state is the state tag beside it, named once), and
 * the list reads "v{seq} · {date}". The internal name is only the option's value, never its text. W7: the picker is a pill in the one
 * secondary look (CANVAS_SECONDARY_PILL) with a chevron; the native select lies invisibly over the whole pill (role=combobox), so any tap opens the list.
 */
import { ChevronDown } from 'lucide-react';
import type { CanvasVersion } from '@/app/data/canvas-service';
import { cn } from '@/lib/utils';
import { nextSeqOf, versionLabelOf, type CanvasReady } from './canvas-page-data';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';

/** What the picker lists for a version: the draft is only its number (the state tag names it), a published one its number and date. */
function optionText(v: CanvasVersion, next: number): string {
  return v.draft ? `v${next}` : versionLabelOf(v, next) ?? 'Version';
}

/** The pill's own text: just the number of the open version. */
function shortLabel(v: CanvasVersion | undefined, next: number): string {
  if (!v) return 'Version';
  return v.draft ? `v${next}` : v.seq != null ? `v${v.seq}` : 'Version';
}

export function VersionSwitcher({ versions, open, onPick }: { versions: CanvasVersion[]; open: string; onPick: (version: string) => void }) {
  const next = nextSeqOf(versions);
  const current = versions.find(v => v.name === open);
  return (
    <label className={cn(CANVAS_SECONDARY_PILL, 'relative w-fit gap-1 pl-3 pr-2 focus-within:ring-2 focus-within:ring-blue-500')} data-testid="canvas-version-picker">
      <span aria-hidden className="truncate" data-testid="canvas-version-short">{shortLabel(current, next)}</span>
      <ChevronDown aria-hidden className="pointer-events-none h-4 w-4 shrink-0 opacity-70" data-testid="canvas-version-chevron" />
      <select
        role="combobox"
        aria-label="Version"
        value={open}
        onChange={e => onPick(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full bg-transparent text-base opacity-0 focus:outline-none"
        data-testid="canvas-version-select"
      >
        {versions.map(v => <option key={v.name} value={v.name}>{optionText(v, next)}</option>)}
      </select>
    </label>
  );
}

/**
 * Which version: the picker when the canvas has several; a lone draft says its number ("v1"; the state tag beside it says Draft); a lone
 * published version needs no label (the title is the canvas). One fact once, no repeated text. Everyone but the owner lists published versions
 * only (the server already withholds a draft from them).
 */
export function CanvasVersionSlot({ ready, viewingDraft, onPick }: { ready: CanvasReady; viewingDraft: boolean; onPick: (version: string) => void }) {
  const versions = ready.isOwner ? ready.versions : ready.versions.filter(v => !v.draft);
  if (versions.length < 2 && !viewingDraft) return null;
  return (
    // A lone "Draft" label keeps its own width on a phone, so the name gets the rest of the row; the version menu shares it.
    <span className="flex min-w-0 max-w-full shrink-0 items-center gap-2 max-sm:flex-none" data-testid="canvas-project-slot">
      <span aria-hidden className="hidden shrink-0 text-foreground/40 sm:inline">·</span>
      {versions.length >= 2
        ? <VersionSwitcher versions={versions} open={ready.version ?? versions[0]?.name ?? ''} onPick={onPick} />
        : <span className="shrink-0 text-sm font-medium text-foreground/70" data-testid="canvas-version-label">v{nextSeqOf(ready.versions)}</span>}
    </span>
  );
}
