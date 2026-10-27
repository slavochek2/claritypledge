/**
 * @file canvas-version-slot.tsx
 * @description The canvas header's version menu (CanvasPage): shown only when the canvas has two or more versions.
 */
import { ChevronDown } from 'lucide-react';
import type { CanvasVersion } from '@/app/data/canvas-service';
import { PILL, SELECT } from './canvas-pill-classes';

/** P1515 phase 5: the canvas's versions, newest first with a date, for everyone the canvas admits. Same outline pill as the
 *  canvas picker; choosing one puts it in the address (`?v=`). */
function VersionSwitcher({ versions, open, onPick }: { versions: CanvasVersion[]; open: string; onPick: (version: string) => void }) {
  const dateOf = (iso: string | null) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  };
  return (
    <label className={`${PILL} border border-foreground/40 bg-muted text-foreground hover:bg-muted/70 max-sm:w-full`} data-testid="canvas-version-picker">
      <select
        aria-label="Version"
        value={open}
        onChange={e => onPick(e.target.value)}
        className={`${SELECT.replace('max-w-[12rem]', 'max-w-[20rem]')} pl-3`}
        data-testid="canvas-version-select"
      >
        {versions.map(v => {
          const date = dateOf(v.createdAt);
          return <option key={v.name} value={v.name}>{date ? `${v.name} · ${date}` : v.name}</option>;
        })}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-70" />
    </label>
  );
}

/** The byline's version slot: a separator dot and the switcher; nothing for a single-version canvas (the title is the name). */
export function CanvasVersionSlot({ versions, version, onPick }: { versions: CanvasVersion[]; version: string | null | undefined; onPick: (version: string) => void }) {
  if (versions.length < 2) return null;
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2 max-sm:order-2 max-sm:flex-1 max-sm:flex-wrap" data-testid="canvas-project-slot">
      <span aria-hidden className="hidden shrink-0 text-foreground/40 sm:inline">·</span>
      {/* The dropdown lists the versions of THIS canvas, for owner and readers alike; with one version the title above is the name.
          Separate canvases are reached by their own address. */}
      <VersionSwitcher versions={versions} open={version ?? versions[0]?.name ?? ''} onPick={onPick} />
    </span>
  );
}
