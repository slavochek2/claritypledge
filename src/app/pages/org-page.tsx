/**
 * @file org-page.tsx
 * @description P1010: Clarity Group page (/groups/:slug). A Meetup-style
 * container with About / Members / Events tabs and a persistent Join / Manage
 * membership CTA. Join routes to /groups/:slug/join, where accepting the Clarity
 * Group Terms creates the membership row (which IS the acceptance record).
 * About describes the group; the terms live on the join page, not here.
 * Events reuses the production events list (/events/list) — NOT the /cm calendar.
 *
 * One hardcoded org exists (cm); an unknown slug renders a not-found state, never a
 * create-org flow (Decision 7, Non-Goals). The route stays dynamic rather than static
 * on purpose — the slug is a lookup key, not a creation surface (Decision, spec line
 * 254) — so a second seeded org needs no routing change. `champions` was seeded here
 * originally and cut before it reached prod (founder decision, 2026-07-29).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrgHeader } from "@/app/components/organizations/org-header";
import { PledgerGrid } from "@/app/components/social/pledger-grid";
import { EventsList } from "@/app/prototypes/events/components/EventsList";
import { organizationsService } from "@/app/data/organizations-service";
import type { Organization, OrgMember, OrgParticipation, OrgRole } from "@/app/data/organizations-service.interface";

type OrgTab = "about" | "members" | "events";

/** Underline tab styling — page-level navigation (see TabsList comment below). */
const ORG_TAB_CLASS =
  "min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 text-base " +
  "data-[state=active]:border-blue-500 data-[state=active]:bg-transparent " +
  "data-[state=active]:text-foreground data-[state=active]:shadow-none";

export function OrgPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [org, setOrg] = useState<Organization | null>(null);
  // P1060 review (HIGH): `undefined` means NOT YET KNOWN — either still loading or
  // the load failed. `[]` means the roster really is empty. Keeping these distinct is
  // the whole fix: the roster load swallows its error by design (see loadRoster), so
  // defaulting to `[]` published a confident "0 members" every time the fetch failed.
  // `participation` already models absence this way; the roster now matches it.
  const [members, setMembers] = useState<OrgMember[] | undefined>(undefined);
  const [myRole, setMyRole] = useState<OrgRole | null>(null);
  // P1060 D9: distinct RSVP'd profiles across this org's events. Undefined until
  // loaded and absent for a zero-participant org — both render as no row at all.
  const [participation, setParticipation] = useState<OrgParticipation | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<OrgTab>("about");
  // P1076: the post-join nudge — shown once, from either join path (own click via
  // org-join-page, or auto-join via AuthCallbackPage), both of which navigate here
  // with this history state. Read once into local state on mount, THEN clear the
  // history state itself — `window.history.state` (and so `location.state`) survives
  // a hard reload and browser back-navigation, so leaving it in place would resurrect
  // the banner on either after dismissal. Local state is what "once" actually means.
  const [showJustJoinedBanner, setShowJustJoinedBanner] = useState(
    () => Boolean((location.state as { justJoined?: boolean } | null)?.justJoined),
  );

  useEffect(() => {
    if ((location.state as { justJoined?: boolean } | null)?.justJoined) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // Intentionally mount-only: consumes the history state exactly once. Re-running
    // on navigate/location changes would clear state from an unrelated navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orgId = org?.id ?? null;
  const orgSlug = org?.slug ?? null;
  const userId = user?.id ?? null;
  const isMember = myRole !== null;
  // P1060 D4: hosting into an organization is an ORGANIZER capability, not a
  // membership one — `membership_insert` lets any authenticated user join a public
  // org in one click, so "any member" would be close to "anyone" in practice.
  const canHost = myRole === "organizer";

  // Load the org + its (public) roster. Keyed on slug/reload ONLY — a user or
  // token-refresh change must never flash the spinner or reset the active tab
  // out from under the user mid-session (that's what the separate membership
  // effect below is for).
  useEffect(() => {
    let cancelled = false;

    async function loadRoster(orgSlugToLoad: string) {
      try {
        const roster = await organizationsService.getMembers(orgSlugToLoad);
        if (!cancelled) setMembers(roster);
      } catch (err) {
        // Still swallowed on purpose — see the call site. An empty Members tab is a
        // far better failure than a dead Events page. But it must stay UNKNOWN, not
        // become a zero: leaving `members` undefined is what keeps the count and the
        // "Be the first to join" copy from asserting something we never learned.
        console.error("Failed to load roster", err);
        if (!cancelled) setMembers(undefined);
      }
    }

    async function loadParticipation(id: string) {
      try {
        const byOrg = await organizationsService.getParticipation([id]);
        if (!cancelled) setParticipation(byOrg[id]);
      } catch (err) {
        console.error("Failed to load participants", err);
      }
    }

    async function loadOrg() {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
      // Must be cleared here, not left to loadRoster. Since the roster is no longer
      // awaited, `loading` clears while it is still in flight — and OrgPage does not
      // remount when navigating between two /groups/:slug pages (same route pattern), so
      // without this the previous org's member count and roster render under the new
      // org's name. If the roster fetch then fails, the wrong roster stays for good.
      setMembers(undefined);
      setParticipation(undefined);
      try {
        const loadedOrg = await organizationsService.getOrganizationBySlug(slug);
        if (cancelled) return;
        if (!loadedOrg) {
          // RLS/query returned null → a genuinely unknown (or private) slug.
          setNotFound(true);
          setOrg(null);
          return;
        }
        setOrg(loadedOrg);
        setActiveTab(loadedOrg.hasEvents ? "events" : "about");
        // The roster is deliberately NOT awaited here. /events now redirects to
        // a group page, so this page is the app's primary Events surface — and if the
        // roster fetch shared this try/catch, a get_organization_members failure
        // would render the full-page "Something went wrong" state and take the
        // events list down with it. The roster only feeds the Members tab; it must
        // degrade to an empty roster, not to a dead page. It also keeps the events
        // behind two sequential round-trips instead of one.
        void loadRoster(loadedOrg.slug);
        // Not awaited, for the same reason the roster is not: a failed count must
        // degrade to no row (which is also the honest zero rendering), never to a
        // dead Events page.
        void loadParticipation(loadedOrg.id);
      } catch (err) {
        // A thrown error is a transient failure (network/RPC), NOT a 404 —
        // surface a retryable error state, never a misleading "not found".
        if (!cancelled) {
          console.error("Failed to load organization", err);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadOrg();
    return () => { cancelled = true; };
  }, [slug, reloadKey]);

  // Load the caller's own membership. Keyed on user id + org id only — no
  // spinner, no tab reset; a token refresh at most re-runs this cheap query.
  useEffect(() => {
    let cancelled = false;
    async function loadMine() {
      if (!orgId) return;
      if (!userId) { setMyRole(null); return; }
      try {
        const mine = await organizationsService.getMyMembership(orgId);
        if (!cancelled) setMyRole(mine?.role ?? null);
      } catch (err) {
        if (!cancelled) console.error("Failed to check membership", err);
      }
    }
    loadMine();
    return () => { cancelled = true; };
  }, [orgId, userId]);

  // Refetch just the roster (after a join/leave) without touching loading/tab state.
  const reloadRoster = useCallback(async () => {
    if (!orgSlug) return;
    try {
      setMembers(await organizationsService.getMembers(orgSlug));
    } catch (err) {
      // Same rule as the initial load: a failed refetch must not silently downgrade a
      // known roster to "0 members". Drop back to unknown and let the UI say so.
      console.error("Failed to reload roster", err);
      setMembers(undefined);
    }
  }, [orgSlug]);

  // Join is a terms-acceptance gate, not an in-place toggle — it always routes to
  // the dedicated terms page. Unauthenticated visitors may read the terms there;
  // login is only required at the accept action.
  // Forwards ?from= (P1076 session revision, 2026-08): invite links now point at
  // this page, not straight at /join, so the attribution param arrives here first
  // and must be carried onto /join or it's silently dropped.
  const handleJoin = useCallback(() => {
    const from = new URLSearchParams(location.search).get("from");
    const joinPath = `${location.pathname.replace(/\/$/, "")}/join`;
    navigate(from ? `${joinPath}?from=${encodeURIComponent(from)}` : joinPath);
  }, [navigate, location.pathname, location.search]);

  const handleLeave = useCallback(async () => {
    if (!org) return;
    try {
      const { left } = await organizationsService.leaveOrganization(org.id);
      // Only track a real leave — zero rows matched (double-click, already left) means
      // nothing actually changed.
      if (left) {
        analytics.track('org_left', { org_slug: org.slug });
      }
      setMyRole(null);
      await reloadRoster();
    } catch (err) {
      console.error("Failed to leave organization", err);
      toast.error("Couldn't complete leaving. Please try again.");
      // Rethrow so the confirm dialog knows the leave failed and stays open —
      // OrgHeader awaits this. Swallowing it here closed the dialog on failure,
      // which reads as "left" while the membership row is still there.
      throw err;
    }
  }, [org, reloadRoster]);

  // P1193: the roster already carries every member's role, so the organizer count is
  // a filter over state the page has loaded — no second query, no new service method.
  //
  // `members === undefined` propagates as null (UNKNOWN), NOT as 0. The distinction is
  // the entire point: loadRoster swallows its error by design, so a failed fetch also
  // produces no rows, and `(members ?? []).filter(...).length` would report a confident
  // "0 organizers" about a group that may have three. OrgHeader refuses to offer Leave
  // on null rather than guessing which way to resolve it.
  const organizerCount = useMemo(
    () => (members === undefined ? null : members.filter((m) => m.role === "organizer").length),
    [members],
  );

  const rosterItems = useMemo(
    () => (members ?? []).map((m) => ({
      id: m.profileId,
      slug: m.slug ?? "",
      name: m.name,
      reason: m.reason ?? undefined,
      signedAt: m.acceptedAt,
      avatarColor: m.avatarColor ?? undefined,
      avatarUrl: m.avatarUrl ?? undefined,
      badge: m.role === "organizer" ? "Organizer" : undefined,
      isPledger: m.hasPledged,
    })),
    [members],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen justify-center py-20" data-testid="loader">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Couldn't load group" description="A temporary error occurred loading this page." />
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">
          We couldn't load this page. Please try again.
        </p>
        <Button className="mt-6 min-h-11" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Group not found" description="This Clarity Group does not exist." />
        <h1 className="text-2xl font-bold">Group not found</h1>
        <p className="mt-3 text-muted-foreground">
          Check the link and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <SEO title={org.name} description={org.blurb ?? `The ${org.name} community on Clarity Pledge.`} url={`/groups/${org.slug}`} />
      <div className="container mx-auto max-w-5xl space-y-8">
        {/* P1204: P1193's own rename scope named this and never built it. Small
            inline link, not FocusHeader — this stays a Browse page (BottomNav
            visible, like /p/:slug), not a Focus page (docs/ux-patterns.md).
            Grey, not blue: matches the dominant back-link idiom elsewhere in
            the app (FocusHeader, agreement/badge/story back links all use
            text-muted-foreground) — blue is reserved for "you can click
            this to act", and a back link is navigation, not an action. */}
        <Link
          to="/groups"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back to groups
        </Link>

        {showJustJoinedBanner && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span>Welcome! Know someone who might want to join too?</span>
            <button
              type="button"
              onClick={() => setShowJustJoinedBanner(false)}
              className="shrink-0 rounded p-1 text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss"
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <OrgHeader
          org={org}
          memberCount={members?.length ?? null}
          isMember={isMember}
          myRole={myRole}
          organizerCount={organizerCount}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onShowMembers={() => setActiveTab("members")}
          participation={participation}
          currentUserId={userId}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OrgTab)}>
          {/* Page-level nav uses the UNDERLINE idiom. The pill/segmented control
              is reserved for in-content filters (Upcoming/Past inside Events) —
              two levels of navigation must not share one visual language. */}
          <TabsList className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
            {org.hasEvents && <TabsTrigger value="events" className={ORG_TAB_CLASS}>Events</TabsTrigger>}
            <TabsTrigger value="members" className={ORG_TAB_CLASS}>Members</TabsTrigger>
            <TabsTrigger value="about" className={ORG_TAB_CLASS}>About</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="pt-4">
            <AboutSection org={org} />
          </TabsContent>

          {org.hasEvents && (
            <TabsContent value="events" className="pt-4">
              {/* The production events list, embedded — NOT the /cm Google Calendar
                  embed, which stays on /cm and is a different surface entirely. */}
              {/* P1060: the org's OWN events only. Before this the embedded list
                  called getUpcomingEvents()/getPastEvents() with no org argument,
                  so every organization showed every event on the platform — the
                  defect that made two organizations worse than one. */}
              <EventsList
                embedded
                orgId={org.id}
                orgSlug={org.slug}
                orgName={org.name}
                canHost={canHost}
              />
            </TabsContent>
          )}

          <TabsContent value="members" className="pt-4">
            {members === undefined ? (
              /* P1060 review (HIGH): unknown roster is NOT an empty roster. Saying
                 "Be the first to join" to someone looking at a failed fetch invents a
                 fact about the group. */
              <p className="py-8 text-center text-sm text-muted-foreground">
                Couldn't load members. Reload to try again.
              </p>
            ) : rosterItems.length > 0 ? (
              // variant="member": these are MEMBERS, not pledgers. Cards open the
              // person's profile (a member may have no pledge certificate to open)
              // and only ring the ones who actually pledged.
              <PledgerGrid items={rosterItems} variant="member" />
            ) : (
              <div className="text-center py-12">
                {org.blurb && <p className="mb-4 text-muted-foreground">{org.blurb}</p>}
                <p className="text-lg font-semibold">Be the first to join</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * About tab — what this group IS. The Clarity Group Terms are NOT
 * here: they are the join gate and live on /groups/:slug/join (org-join-page.tsx).
 * The persistent header CTA is the single route to membership from this page —
 * no second Join button here (P955: one primary action per view).
 */
function AboutSection({ org }: { org: Organization }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8">
        <h2 className="text-xl font-bold md:text-2xl">About {org.name}</h2>
        {org.description ? (
          org.description.split(/\n{2,}/).map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-base leading-relaxed">
              {paragraph}
            </p>
          ))
        ) : (
          <p className="text-base leading-relaxed text-muted-foreground">
            {org.blurb ?? "A Clarity Group."}
          </p>
        )}
      </div>

      <p className="text-base leading-relaxed">
        This group runs on the{" "}
        <Link to={`/groups/${org.slug}/join`} className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">
          Clarity Group Terms
        </Link>
        {" "}— every member accepts them on joining.
      </p>
    </div>
  );
}
