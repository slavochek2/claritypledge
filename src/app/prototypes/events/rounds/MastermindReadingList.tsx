/**
 * @file MastermindReadingList.tsx
 * @description The positions list inside the round card's reading part (UAT 2026-11-11, items 4 and 5): one row per point with
 * Agree, Unsure and Disagree inline, one tap per point, no opening cards and no "agree with all". A reader sees, under a point
 * the Clarity Canvas owner has not taken a position on, that they have not. The owner sees only the points that changed since their
 * last version. Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ReadingPoints } from './use-reading-points';
import {
  NO_OWNER_POSITION_LINE,
  OWNER_NOTHING_TO_SET_LINE,
  OWNER_SET_POSITIONS_LINE,
  POSITION_TAPS,
  READER_SET_POSITIONS_LINE,
  tapOf,
} from './mastermind-round-helpers';

export function MastermindReadingList({ reading, isOwner }: { reading: ReadingPoints; isOwner: boolean }) {
  const [refused, setRefused] = useState(false);
  const { points, loaded, failed, mark, retry } = reading;

  if (failed) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" role="alert" data-testid="reading-error">
        <span>Could not load the points.</span>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retry} data-testid="reading-retry">Retry</Button>
      </div>
    );
  }
  if (!loaded) return <Skeleton className="mt-3 h-24 w-full" data-testid="reading-skeleton" />;
  if (points.length === 0) {
    return isOwner ? <p className="mt-3 text-sm" data-testid="reading-owner-nothing">{OWNER_NOTHING_TO_SET_LINE}</p> : null;
  }

  const tap = async (pointId: string, value: (typeof POSITION_TAPS)[number]['value']) => {
    setRefused(!(await mark(pointId, value)));
  };
  return (
    <div className="mt-3" data-testid="reading-list">
      <p className="text-sm text-muted-foreground">{isOwner ? OWNER_SET_POSITIONS_LINE : READER_SET_POSITIONS_LINE}</p>
      <ul className="mt-2 space-y-4">
        {points.map(p => {
          const chosen = tapOf(p.mine);
          return (
            <li key={p.id} data-testid="reading-point">
              <p className="break-words text-base">{p.statement}</p>
              {!isOwner && !p.owners && <p className="mt-1 text-xs text-muted-foreground" data-testid="reading-no-owner-position">{NO_OWNER_POSITION_LINE}</p>}
              <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Your position">
                {POSITION_TAPS.map(t => (
                  <Button
                    key={t.value}
                    type="button"
                    variant={chosen === t.value ? 'default' : 'outline'}
                    className={cn('min-h-11 px-1 text-sm', chosen === t.value && 'bg-blue-500 text-white hover:bg-blue-700')}
                    aria-pressed={chosen === t.value}
                    onClick={() => void tap(p.id, t.value)}
                    data-testid={`reading-${t.value}`}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {refused && <p className="mt-2 text-sm text-red-600" role="alert" data-testid="reading-refused">Your position was not saved. Try again.</p>}
    </div>
  );
}
