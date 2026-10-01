/**
 * @file PrepHostList.tsx
 * @description P1336 host view — per registrant: preparation state, opt-in + 0-10, positions
 * a/n, recording volunteer + mic. Summary: "{v} volunteers · {k} USB-C mics needed" (v above
 * the places signals overbooking). Read through get_event_prep_host_view, which refuses anyone
 * but the event's host and excludes the host's own account. Rows are PersonRow, as the
 * Participants card above it renders them.
 */
import { useEffect, useState } from 'react';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { getPrepHostView, type HostPrepRow } from '@/app/data/event-prep-service';
import type { EventWithHost } from '@/app/types';

/** Steps the plan counts, for "in progress, step N" (the plan screen is not a step). */
const countSteps = (row: HostPrepRow) => row.stepsDone.filter((s) => s !== 'plan').length;

export function prepStateLabel(row: HostPrepRow): string {
  if (row.completedAt) return 'Prepared';
  if (row.startedAt) return `In progress, step ${countSteps(row) + 1}`;
  if (row.prepChoice === 'remind') return 'Chose remind';
  return 'Not started';
}

function optInLabel(row: HostPrepRow): string {
  if (row.optedIn === null) return 'Opt-in: not answered';
  const base = row.optedIn ? 'Opted in' : 'Opted out';
  // The room roster's own wording ("understood at N/10").
  return row.principleRating === null ? base : `${base} · understood at ${row.principleRating}/10`;
}

function volunteerLabel(row: HostPrepRow): string | null {
  if (row.researchState !== 'confirmed') return null;
  return row.micSetup === 'usbc' ? 'Volunteer · USB-C mic to bring' : 'Volunteer · own mic';
}

export function hostSummary(rows: HostPrepRow[]): string {
  const volunteers = rows.filter((r) => r.researchState === 'confirmed');
  const usbc = volunteers.filter((r) => r.micSetup === 'usbc').length;
  return `${volunteers.length} ${volunteers.length === 1 ? 'volunteer' : 'volunteers'} · ${usbc} USB-C ${usbc === 1 ? 'mic' : 'mics'} needed`;
}

export function PrepHostList({ event }: { event: EventWithHost }) {
  const [rows, setRows] = useState<HostPrepRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPrepHostView(event.id)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [event.id]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6" data-testid="prep-host-list">
      <h2 className="font-semibold text-sm text-muted-foreground mb-1">Preparation</h2>
      {failed && <p className="text-sm text-muted-foreground">Could not load preparations.</p>}
      {rows && (
        <>
          <p className="text-sm text-foreground mb-4" data-testid="prep-host-summary">
            {hostSummary(rows)}
            {rows.filter((r) => r.researchState === 'confirmed').length > (event.researchPlaces ?? 6) && ' (more than the places)'}
          </p>
          <div className="space-y-3">
            {rows.map((row) => {
              const volunteer = volunteerLabel(row);
              return (
                <div key={row.profileId} data-testid="prep-host-row">
                  <PersonRow
                    profileId={row.profileId}
                    slug={row.slug}
                    name={row.name}
                    avatarColor={row.avatarColor ?? "#3B82F6"}
                    avatarUrl={row.avatarUrl}
                    isPledger={row.hasPledged}
                    showEarBadge={false}
                  />
                  <ul className="mt-1 space-y-0.5 px-3 text-sm text-foreground/80">
                    <li data-testid="prep-host-state">{prepStateLabel(row)}</li>
                    <li data-testid="prep-host-optin">{optInLabel(row)}</li>
                    {row.positionsTotal > 0 && (
                      <li data-testid="prep-host-positions">Positions {row.positionsDone}/{row.positionsTotal}</li>
                    )}
                    {volunteer && <li data-testid="prep-host-volunteer">{volunteer}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
