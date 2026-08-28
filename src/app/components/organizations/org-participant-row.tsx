/**
 * @file org-participant-row.tsx
 * @description P1060 D9/D10: the participant count + overlapping avatar row, shown
 * on the /org directory card and in the org page header.
 *
 * REUSES the social-proof.tsx pattern rather than inventing one (spec Solution
 * item 8, Done-When bullet 13): `-space-x-2` overlap, PersonAvatar at size="sm",
 * a fixed row height so the row never collapses 0→32px and shifts the layout, and
 * `relative z-10` on the `+N` badge. That z-10 is not decoration — `-space-x-2`
 * pulls each sibling 8px over the previous and the avatars win the paint order
 * despite the badge coming last in the DOM, so without it the badge's "+" sits
 * under the final avatar and the number reads as a bare truncated count.
 * social-proof.tsx records that bug; a fresh implementation rediscovers it.
 *
 * The label is "{N} have joined events", verbatim and un-pluralized (RESOLVED
 * 2026-08-28). We record RSVPs, not attendance: "45 participants" reads as
 * "45 people came", and what we know is "45 people said they would". For a
 * product whose subject is calibrated claims, that gap is not papered over in
 * its own directory.
 */
import type { PersonRef } from "@/app/types";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { PARTICIPANT_AVATAR_LIMIT } from "@/app/data/organizations-service";
import type { OrgParticipation } from "@/app/data/organizations-service.interface";

interface OrgParticipantRowProps {
  /** Undefined or count 0 → renders nothing at all (D9: no row, no "0"). */
  participation?: OrgParticipation;
  className?: string;
}

export function OrgParticipantRow({ participation, className = "" }: OrgParticipantRowProps) {
  // D9, literally: an organization with zero participants omits the row ENTIRELY
  // rather than printing "0" — the same rule as the NULL blurb and the past count.
  // · Online at launch is exactly this state, and it is the state an invited
  // stranger is most likely to land on.
  if (!participation || participation.count === 0) return null;

  // Derive the badge from what is actually DRAWN, never from the limit constant —
  // social-proof.tsx's badge was permanently short by 2 for exactly that reason.
  const shown = participation.sample.slice(0, PARTICIPANT_AVATAR_LIMIT);
  const overflow = participation.count - shown.length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-8 items-center -space-x-2">
        {shown.map((person) => (
          <PersonAvatar
            key={person.profileId}
            person={{
              name: person.name,
              slug: person.slug,
              avatarColor: person.avatarColor,
              avatarUrl: person.avatarUrl,
              hasPledged: person.hasPledged,
            } satisfies PersonRef}
            size="sm"
            className="h-8 w-8 border-2 border-background"
          />
        ))}
        {overflow > 0 && (
          <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>
      {/* Verbatim, un-pluralized: "1 have joined events" is the intended string. */}
      <p className="text-sm text-muted-foreground">{participation.count} have joined events</p>
    </div>
  );
}
