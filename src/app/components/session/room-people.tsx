/**
 * @file room-people.tsx
 * @description P1388 (founder, 2026-10-02): who is in the room, as faces that lead to profiles —
 * so people can find each other after the conversation.
 *
 * Sits on the controls line beside the meter: MAX_FACES overlapping faces and "+N". Tapping the
 * stack opens the full list (photo, name, link to profile). The person speaking carries a ring.
 * Names are always in the text (screen readers, and the roster e2e reads them).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fetchRoomPeople, type TranscribeRoomMember } from '@/app/data/transcribe-service';
import type { PersonRef } from '@/app/types';

/** Founder, 2026-10-02: three small faces and "+N", beside the sound meter. */
const MAX_FACES = 3;

function personFor(m: TranscribeRoomMember, people: Record<string, PersonRef>): PersonRef {
  // The name said in this room is the one shown; the profile supplies the face and the link.
  return { ...(people[m.profileId] ?? { hasPledged: false }), name: m.displayName };
}

export function RoomPeople({ members, speakingIds }: { members: TranscribeRoomMember[]; speakingIds: ReadonlySet<string> }) {
  const [people, setPeople] = useState<Record<string, PersonRef>>({});
  const [open, setOpen] = useState(false);
  const idsKey = useMemo(() => [...new Set(members.map((m) => m.profileId))].sort().join(','), [members]);

  useEffect(() => {
    let live = true;
    void fetchRoomPeople(idsKey ? idsKey.split(',') : []).then((p) => { if (live) setPeople(p); });
    return () => { live = false; };
  }, [idsKey]);

  const shown = members.slice(0, MAX_FACES);
  const rest = members.length - shown.length;

  return (
    <div className="flex items-center" data-testid="transcribe-roster">
      {/* ONE target for the whole stack: overlapping 32 px faces are too small to tap one by
          one on a phone. The list it opens links each person to their profile. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${members.length} in the room — see who`}
        className="flex items-center min-h-10 rounded-full pr-1"
      >
        {shown.map((m) => (
          <span key={m.id} className={`-ml-2 first:ml-0 inline-flex rounded-full border-2 border-white ${speakingIds.has(m.id) ? 'ring-2 ring-blue-500' : ''}`}>
            <PersonAvatar person={personFor(m, people)} size="sm" />
          </span>
        ))}
        {rest > 0 && (
          <span className="-ml-2 h-8 min-w-8 px-1 rounded-full bg-slate-100 border-2 border-white text-xs font-semibold text-slate-700 inline-flex items-center justify-center" data-testid="transcribe-roster-more">
            +{rest}
          </span>
        )}
        <span className="sr-only">{members.map((m) => m.displayName).join(', ')}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto" data-testid="transcribe-roster-list">
          <DialogTitle>{members.length} in the room</DialogTitle>
          <ul className="divide-y">
            {members.map((m) => {
              const person = personFor(m, people);
              const row = (
                <>
                  <PersonAvatar person={person} size="sm" />
                  <span className="text-sm font-medium">{m.displayName}</span>
                  {speakingIds.has(m.id) && <span className="text-xs text-blue-600">speaking</span>}
                </>
              );
              return (
                <li key={m.id}>
                  {person.slug ? (
                    <Link to={`/p/${person.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 py-2 min-h-11 hover:bg-slate-50 rounded">{row}</Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2 min-h-11">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
