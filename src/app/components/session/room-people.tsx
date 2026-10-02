/**
 * @file room-people.tsx
 * @description P1388 (founder, 2026-10-02): who is in the room, as faces that lead to profiles —
 * so people can find each other after the conversation.
 *
 * One line however big the room gets: up to MAX_FACES faces, or MAX_FACES-1 and a "+N" circle.
 * Tapping "+N" or the count opens the full list (photo, name, link). The person speaking carries
 * a ring. Names are always in the text (screen readers, and the roster e2e reads them).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fetchRoomPeople, type TranscribeRoomMember } from '@/app/data/transcribe-service';
import type { PersonRef } from '@/app/types';

const MAX_FACES = 5;

function personFor(m: TranscribeRoomMember, people: Record<string, PersonRef>): PersonRef {
  const p = people[m.profileId];
  // The name said in this room is the one shown; the profile supplies the face and the link.
  return { ...(p ?? { hasPledged: false }), name: m.displayName };
}

function Face({ member, person, speaking }: { member: TranscribeRoomMember; person: PersonRef; speaking: boolean }) {
  const face = (
    <span className={`inline-flex rounded-full ${speaking ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
      <PersonAvatar person={person} size="sm" />
    </span>
  );
  return person.slug ? (
    <Link to={`/p/${person.slug}`} aria-label={`${member.displayName}${speaking ? ' (speaking)' : ''} — profile`} className="-ml-2 first:ml-0 rounded-full">
      {face}
    </Link>
  ) : (
    <span aria-label={member.displayName} className="-ml-2 first:ml-0">{face}</span>
  );
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

  const overflow = members.length > MAX_FACES;
  const shown = overflow ? members.slice(0, MAX_FACES - 1) : members;
  const rest = members.length - shown.length;

  return (
    <div className="flex items-center gap-3 mb-3" data-testid="transcribe-roster">
      <div className="flex items-center">
        {shown.map((m) => (
          <Face key={m.id} member={m} person={personFor(m, people)} speaking={speakingIds.has(m.id)} />
        ))}
        {overflow && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-2 h-8 w-8 rounded-full bg-slate-100 border-2 border-white text-xs font-semibold text-slate-700"
            data-testid="transcribe-roster-more"
          >
            +{rest}
          </button>
        )}
      </div>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground min-h-10 text-left">
        {members.length} in the room
        <span className="sr-only">: {members.map((m) => m.displayName).join(', ')}</span>
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
