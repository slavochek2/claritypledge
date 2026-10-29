/**
 * @file canvas-version-switcher.tsx
 * @description P1515 phase 5: the canvas's versions, newest first, for everyone the canvas admits. Same outline pill as the
 * canvas picker; choosing one puts it in the address (`?v=`). P1536: each version reads "v{seq} · {date}" (the owner's open
 * draft: "v3 · Draft"); the internal name is only the option's value, never its text.
 */
import { ChevronDown } from 'lucide-react';
import type { CanvasVersion } from '@/app/data/canvas-service';
import { nextSeqOf, versionLabelOf } from './canvas-page-data';
import { PILL, SELECT } from './canvas-pill-styles';

export function VersionSwitcher({ versions, open, onPick }: { versions: CanvasVersion[]; open: string; onPick: (version: string) => void }) {
  const next = nextSeqOf(versions);
  return (
    <label className={`${PILL} border border-foreground/40 bg-muted text-foreground hover:bg-muted/70 max-sm:w-full`} data-testid="canvas-version-picker">
      <select
        aria-label="Version"
        value={open}
        onChange={e => onPick(e.target.value)}
        className={`${SELECT.replace('max-w-[12rem]', 'max-w-[20rem]')} pl-3`}
        data-testid="canvas-version-select"
      >
        {versions.map(v => <option key={v.name} value={v.name}>{versionLabelOf(v, next) ?? 'Version'}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-70" />
    </label>
  );
}
