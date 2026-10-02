/**
 * @file p1337-profile-compare-entry-prototype.tsx
 * @description DEV-only prototype (/tree/compare-entry). P1337 — where "Compare with me" lives.
 *
 * Founder, 2026-10-02: *"I like this — how would it look like on profile? want to /tree it so
 * I can see where this button lives?"* and *"if we do the compare button on the profile, we
 * don't need to wire it in admin users, because then I can go to the user's profile and click
 * on that button, which is more straightforward and not extra admin-only functionality, but
 * anybody's functionality."*
 *
 * Two placements, switchable, on a mock of the real profile header
 * (profile-page-v2.tsx: GravatarAvatar size xl, h2 text-xl font-bold, the blue ear badge,
 * then the Stories / Points tabs).
 *
 * A — HEADER: a button under the name. Always visible, including on the Stories tab. Reads as
 *     "a thing you can do with this person".
 * B — POINTS TAB: a row at the top of the Points list. Visible only where positions are, which
 *     is the only place the comparison means anything, and directly above the data it concerns.
 *
 * Not built here on purpose: wiring it into /admin/users. The founder ruled that out in the
 * same breath — a profile button is everyone's feature, an admin row is an admin-only one.
 *
 * Render-only: mock data, no api.ts / auth imports.
 */
import { useState } from 'react';
import { ArrowLeftRight, Ear } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { cn } from '@/lib/utils';

type Placement = 'header' | 'points';

const PERSON = { name: 'Ben Tan', avatarColor: '#B45309', ear: 12, pledged: true };

/** One button, so the placements differ only in WHERE, never in how it looks. */
function CompareButton({ full }: { full?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 min-h-[40px] text-sm font-medium text-blue-700',
        full && 'w-full',
      )}
    >
      <ArrowLeftRight size={16} />
      Compare with me
    </button>
  );
}

export function ProfileCompareEntryPrototype() {
  const [placement, setPlacement] = useState<Placement>('header');
  const [tab, setTab] = useState<'stories' | 'points'>('points');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-lg px-4 py-5">
        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-gray-200 p-1">
          {(['header', 'points'] as Placement[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPlacement(p);
                if (p === 'points') setTab('points');
              }}
              className={cn(
                'rounded-lg min-h-[40px] text-sm font-medium',
                placement === p ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/60',
              )}
            >
              {p === 'header' ? 'A · in the header' : 'B · on the Points tab'}
            </button>
          ))}
        </div>

        {/* ── the profile header, as profile-page-v2 renders it ─────────────── */}
        <div className="rounded-xl border border-border bg-white p-4">
          <div className="flex items-start gap-3">
            <GravatarAvatar
              name={PERSON.name}
              photoUrl={undefined}
              avatarColor={PERSON.avatarColor}
              isPledger={PERSON.pledged}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-foreground">{PERSON.name}</h2>
                <span className="inline-flex items-center gap-0.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
                  <Ear size={14} />
                  {PERSON.ear}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#1A1A1A]/50">Chiang Mai · joined August</p>

              {placement === 'header' && (
                <div className="mt-3">
                  <CompareButton />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── tabs ───────────────────────────────────────────────────────────── */}
        <div className="mt-4 flex gap-4 border-b border-border px-1">
          {(['stories', 'points'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'pb-2 text-sm font-medium capitalize',
                tab === t ? 'text-[#1A1A1A] border-b-2 border-blue-600' : 'text-[#1A1A1A]/50',
              )}
            >
              {t} {t === 'points' ? '(14)' : '(3)'}
            </button>
          ))}
        </div>

        {placement === 'points' && tab === 'points' && (
          <div className="mt-3">
            <CompareButton full />
          </div>
        )}

        {/* ── stand-in content, so the placement is judged in context ────────── */}
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-white p-4">
              <div className="h-3 w-3/4 rounded bg-gray-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
              <div className="mt-3 h-8 w-40 rounded-full bg-blue-50" />
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-[#1A1A1A]/40 leading-relaxed">
          A is visible on both tabs, including Stories, where there is nothing to compare.
          B appears only where the positions are, but is invisible to anyone who never opens
          the Points tab.
        </p>
      </div>
    </div>
  );
}

export default ProfileCompareEntryPrototype;
