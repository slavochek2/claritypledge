/**
 * @file canvas-version-switcher.tsx
 * @description P1515 phase 5: the canvas's versions, newest first, for everyone the canvas admits; choosing one puts it in the address
 * (`?v=`). P1536: the open version reads "v{seq}" (the owner's open draft: "v{next}"; its state is the (Draft) tag beside it, named once), and
 * the list reads "v{seq} · {date}". The internal name is only the option's value, never its text. W7: the picker is a pill in the one
 * secondary look (CANVAS_SECONDARY_PILL) with a chevron; the native select lies invisibly over the whole pill (role=combobox), so any tap opens the list.
 */
import { ChevronDown } from 'lucide-react';
import type { CanvasVersion } from '@/app/data/canvas-service';
import { cn } from '@/lib/utils';
import { nextSeqOf, versionLabelOf, type CanvasReady } from './canvas-page-data';
import { DRAFT_TAG_LABEL } from './canvas-draft-tag';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';

/**
 * What the picker lists for a version: a published one its number, date and origin ("from v1", D8), the owner's draft its number and "(Draft)". A native <option> holds text only,
 * so the draft row says the tag's word in text; the header beside the closed picker draws the real tag component.
 */
function optionText(v: CanvasVersion, next: number): string {
  if (v.draft) return `v${next} (${DRAFT_TAG_LABEL})`;
  const label = versionLabelOf(v, next) ?? 'Version';
  return v.fromSeq != null ? `${label} · from v${v.fromSeq}` : label; // D8: the origin shows to everyone
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
 * X5/X6: the version sits beside the name as the picker, for a published version or a draft with a base. The closed picker shows the number only, never
 * the tag (the header's tag component sits beside it). Whether it shows at all is the header table's call (`show`, from headerRow); everyone but the owner
 * lists published versions only (the server already withholds a draft from them). A lone version is still a picker: the number is the one fact it names.
 */
export function CanvasVersionSlot({ ready, show, onPick }: { ready: CanvasReady; show: boolean; onPick: (version: string) => void }) {
  const versions = ready.isOwner ? ready.versions : ready.versions.filter(v => !v.draft);
  if (!show || versions.length === 0) return null;
  return (
    <span className="flex min-w-0 max-w-full shrink-0 items-center" data-testid="canvas-project-slot">
      <VersionSwitcher versions={versions} open={ready.version ?? versions[0]?.name ?? ''} onPick={onPick} />
    </span>
  );
}
