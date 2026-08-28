/**
 * @file org-directory-page.tsx
 * @description P1060 D5: /org — a directory of every PUBLIC Clarity Organization.
 * Closes by name the follow-up decisions.md 2026-07-23 [product] deferred
 * ("Deferred to followups: user-facing org creation, discovery index (/org)…").
 * The condition that deferral waited for is the same one that widened P1060: a
 * second organization exists, and with no directory it is reachable only by
 * knowing its URL.
 *
 * EXPLICITLY A LISTING, NEVER A CREATION SURFACE. p1010 Decision 7 stands: no
 * "create organization" affordance appears here, signed in or out. The
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

/**
 * The one-line differentiator under each org name. Founder-approved copy
 * (2026-08-28), from goals.md's topic-source split.
 *
 * A per-slug CONSTANT, not a schema column — deliberately. The spec's Solution
 * section names no column for it, and adding one would make founder copy for two
 * seeded organizations look like a general capability the create-org flow (which
 * does not exist) would have to fill. When a third organization is seeded by
 * hand, its line is added here by hand, in the same commit.
 *
 * Load-bearing now that · Online carries no blurb (D7): with two near-identical
 * names, this is the only text distinguishing them. Treat it as product copy,
 * not a caption.
 */
const ORG_DIFFERENTIATOR: Record<string, string> = {
  cm: "The room brings the topic",
  online: "The topic is set in advance",
};

export function OrgDirectoryPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
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
          organizationsService.getMemberCounts(ids).catch(() => ({})),
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
        title="Clarity Organizations"
        description="Communities practising calibrated communication together."
        url="/org"
      />
      <div className="container mx-auto max-w-5xl space-y-8">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Clarity Organizations</h1>
          <p className="mt-2 max-w-prose text-base text-muted-foreground">
            Communities practising calibrated communication together. Go into one to see
            its events and members.
          </p>
        </header>

        {loadError ? (
          <p className="text-base text-muted-foreground">
            We couldn't load the organizations. Please try again.
          </p>
        ) : orgs.length === 0 ? (
          <p className="text-base text-muted-foreground">No organizations yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {orgs.map((org) => (
              <li key={org.id}>
                <OrgCard
                  org={org}
                  memberCount={memberCounts[org.id] ?? 0}
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

/** Initials tile for an organization. Founder-approved (2026-08-28, "the initials
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
  memberCount: number;
  participation?: OrgParticipation;
  eventSummary?: OrgEventSummary;
  isMine: boolean;
}) {
  const differentiator = ORG_DIFFERENTIATOR[org.slug];
  const pastCount = eventSummary?.pastCount ?? 0;
  const nextEventAt = eventSummary?.nextEventAt ?? null;

  // The footer badge answers the one question a directory is asked: is anything
  // happening here. An org with nothing scheduled says so rather than going blank —
  // a missing badge reads as a broken card, not as an empty calendar.
  const badgeLabel = nextEventAt
    ? `Next event ${new Date(nextEventAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : pastCount > 0
      ? "Nothing scheduled"
      : "First event coming";

  return (
    <div
      data-testid="org-card"
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <OrgInitials name={org.name} />
          <div className="min-w-0">
            {/* The whole card is NOT the link: the card carries counts and avatars,
                and wrapping them in an anchor makes every avatar part of the link's
                accessible name. One named link per card, keyboard-reachable, Enter
                activates — the a11y contract. */}
            <Link
              to={`/org/${org.slug}`}
              className="rounded text-lg font-semibold underline-offset-2 hover:text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {org.name}
            </Link>
            {differentiator && (
              <p className="mt-1 text-sm text-muted-foreground">{differentiator}</p>
            )}
          </div>
        </div>
        {/* The ONLY signed-in delta (UX reference Screen B). green-600 is reserved
            for the membership badge and nothing else. Carries its own text, never
            color alone (WCAG 1.4.1). */}
        {isMine && (
          <span
            data-testid="org-membership-badge"
            className="shrink-0 rounded-full border border-green-600/30 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
          >
            You're a member
          </span>
        )}
      </div>

      {/* D7: a NULL blurb renders as ABSENCE — no placeholder string, no
          "A Clarity Organization." filler. The line is simply not there. */}
      {org.blurb && <p className="text-sm text-muted-foreground">{org.blurb}</p>}

      <OrgParticipantRow participation={participation} />

      {/* Meta row. The member count carries the same person glyph the org header
          gives it — one fact, one rendering, on both surfaces. */}
      <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <UsersIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>
        {pastCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pastCount} past {pastCount === 1 ? "event" : "events"}
          </span>
        )}
      </p>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {badgeLabel}
        </span>
        {/* Matches the existing text-link idiom (font-medium text-blue-600 with an
            offset underline) used elsewhere on org surfaces rather than inventing a
            new affordance. aria-hidden on the arrow keeps the link's accessible
            name to the words. */}
        <Link
          to={`/org/${org.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline"
        >
          Open
          <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
