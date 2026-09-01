/**
 * @file org-directory-page.tsx
 * @description P1060 D5: /groups — a directory of every PUBLIC Clarity Group.
 * Closes by name the follow-up decisions.md 2026-07-23 [product] deferred
 * ("Deferred to followups: user-facing org creation, discovery index (/org)…" —
 * that entry names the pre-P1193 path; the route is /groups now).
 * The condition that deferral waited for is the same one that widened P1060: a
 * second group exists, and with no directory it is reachable only by
 * knowing its URL.
 *
 * EXPLICITLY A LISTING, NEVER A CREATION SURFACE. p1010 Decision 7 stands: no
 * "create group" affordance appears here, signed in or out. The
 * create-org gap is real, named in the spec, and owned by nobody yet — it does
 * not get quietly solved by this page.
 *
 * Readable signed-out, like the org pages themselves. The ONLY signed-in delta
 * is a membership badge on the cards you belong to.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, CalendarDaysIcon, UsersIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { OrgParticipantRow } from "@/app/components/organizations/org-participant-row";
import { organizationsService } from "@/app/data/organizations-service";
import type {
  Organization,
  OrgEventSummary,
  OrgParticipation,
} from "@/app/data/organizations-service.interface";

export function OrgDirectoryPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  // P1060 review (HIGH): a failed getMemberCounts must not print "0 members" on
  // every card. `null` = the whole fetch failed (unknown); a missing key inside a
  // successful fetch still means a genuine zero.
  const [memberCounts, setMemberCounts] = useState<Record<string, number> | null>({});
  const [participation, setParticipation] = useState<Record<string, OrgParticipation>>({});
  const [myOrgIds, setMyOrgIds] = useState<Set<string>>(new Set());
  const [eventSummaries, setEventSummaries] = useState<Record<string, OrgEventSummary>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await organizationsService.listPublicOrganizations();
        if (cancelled) return;
        setOrgs(list);

        const ids = list.map((o) => o.id);
        // Counts and memberships are NOT awaited together with the list on purpose:
        // a card with a name and a link is already useful, and a failed count must
        // never take the directory down with it. Each degrades to absent — which is
        // also the honest rendering (no row, no "0").
        const [counts, part, mine, summaries] = await Promise.all([
          organizationsService.getMemberCounts(ids).catch(() => null),
          organizationsService.getParticipation(ids).catch(() => ({})),
          organizationsService.getMyMembershipOrgIds().catch(() => [] as string[]),
          organizationsService.getEventSummaries(ids).catch(() => ({})),
        ]);
        if (cancelled) return;
        setMemberCounts(counts);
        setParticipation(part);
        setMyOrgIds(new Set(mine));
        setEventSummaries(summaries);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load organizations", err);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen justify-center py-20" data-testid="loader">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <SEO
        title="Clarity Groups"
        description="Communities practising calibrated communication together."
        url="/groups"
      />
      <div className="container mx-auto max-w-5xl space-y-8">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Clarity Groups</h1>
          <p className="mt-2 max-w-prose text-base text-muted-foreground">
            Communities practising calibrated communication together. Go into one to see
            its events and members.
          </p>
        </header>

        {loadError ? (
          <p className="text-base text-muted-foreground">
            We couldn't load the groups. Please try again.
          </p>
        ) : orgs.length === 0 ? (
          <p className="text-base text-muted-foreground">No groups yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {orgs.map((org) => (
              <li key={org.id}>
                <OrgCard
                  org={org}
                  memberCount={memberCounts === null ? null : (memberCounts[org.id] ?? 0)}
                  participation={participation[org.id]}
                  eventSummary={eventSummaries[org.id]}
                  isMine={myOrgIds.has(org.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-muted-foreground">
          Looking for a single event?{" "}
          <Link
            to="/events/list"
            className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
          >
            Browse all events
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/** Initials tile for a group. Founder-approved (2026-08-28, "the initials
 *  tiles"). Two characters at most: a bare glyph reads as an avatar, three reads as
 *  a word. Decorative — the name beside it carries the accessible identity. */
function OrgInitials({ name }: { name: string }) {
  const initials = name
    .replace(/^Clarity Practice Community[^A-Za-z0-9]*/i, "")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700"
    >
      {initials || "C"}
    </div>
  );
}

function OrgCard({
  org,
  memberCount,
  participation,
  eventSummary,
  isMine,
}: {
  org: Organization;
  /** null = counts could not be loaded; render no count rather than a false 0. */
  memberCount: number | null;
  participation?: OrgParticipation;
  eventSummary?: OrgEventSummary;
  isMine: boolean;
}) {
  const pastCount = eventSummary?.pastCount ?? 0;

  return (
    <div
      data-testid="org-card"
      className="group relative flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-blue-500/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <OrgInitials name={org.name} />
          <div className="min-w-0">
            {/* Stretched-link pattern: this named Link stays the ONE accessible
                link (keyboard-reachable, Enter activates) — the a11y contract the
                comment it replaces was protecting. The ::after pseudo-element
                below covers the whole card for pointer users, without dragging
                avatars/counts into the link's accessible name. */}
            <Link
              to={`/groups/${org.slug}`}
              className="rounded text-lg font-semibold underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:text-blue-600 hover:underline focus-visible:outline-none"
            >
              {org.name}
            </Link>
          </div>
        </div>
        {/* The ONLY signed-in delta (UX reference Screen B). Membership is a
            status, not a success — green is reserved for success states only
            (design-system.md), so this uses the neutral/muted token instead.
            Carries its own text, never color alone (WCAG 1.4.1). */}
        {isMine && (
          <span
            data-testid="org-membership-badge"
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            You're a member
          </span>
        )}
      </div>

      {/* D7: a NULL blurb renders as ABSENCE — no placeholder string, no
          "A Clarity Group." filler. The line is simply not there. */}
      {org.blurb && <p className="text-sm text-muted-foreground">{org.blurb}</p>}

      <OrgParticipantRow participation={participation} />

      {/* Meta row. The member count carries the same person glyph the org header
          gives it — one fact, one rendering, on both surfaces. */}
      <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {/* P1060 review (HIGH): unknown count renders as absence, not as "0 members". */}
        {memberCount !== null && (
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        )}
        {pastCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pastCount} past {pastCount === 1 ? "event" : "events"}
          </span>
        )}
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        {/* P1204: purely decorative wayfinding now that the card itself is the
            click target (stretched link above) — an interactive element here
            would be a second, nested interactive target inside the stretched
            link, which is invalid. tabIndex/aria-hidden already made it
            non-reachable; dropping the <Link> wrapper makes that literal. */}
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 underline-offset-2 group-hover:underline"
        >
          Open
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
