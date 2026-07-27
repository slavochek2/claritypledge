/**
 * @file org-page.tsx
 * @description P1010: Clarity Organization page (/org/:slug). A Meetup-style
 * container with About / Members / Events tabs and a persistent Join / Manage
 * membership CTA. Join = accepting the single-party Clarity Organization Agreement
 * (COA) — the membership row IS the acceptance record (Decisions 3, 4).
 *
 * Only two hardcoded orgs exist (cm, champions); an unknown slug renders a
 * not-found state, never a create-org flow (Decision 7, Non-Goals).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrgHeader } from "@/app/components/organizations/org-header";
import { PledgerGrid } from "@/app/components/social/pledger-grid";
import { OathText } from "@/app/content/oath-emphasis";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { buildEmbedUrl } from "@/lib/chiang-mai-calendar";
import { organizationsService } from "@/app/data/organizations-service";
import type { Organization, OrgMember, OrgRole } from "@/app/data/organizations-service.interface";

type OrgTab = "about" | "members" | "events";

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
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [myRole, setMyRole] = useState<OrgRole | null>(null);
  const [activeTab, setActiveTab] = useState<OrgTab>("about");
  const [accepting, setAccepting] = useState(false);
  // The "I Accept & Join" action is revealed only after a non-member clicks the
  // header "Join" — otherwise the header CTA and the accept button would both be
  // present at once (their accessible names collide on the substring "Join").
  const [joinIntent, setJoinIntent] = useState(false);

  const orgId = org?.id ?? null;
  const orgSlug = org?.slug ?? null;
  const userId = user?.id ?? null;
  const isMember = myRole !== null;

  // Load the org + its (public) roster. Keyed on slug/reload ONLY — a user or
  // token-refresh change must never flash the spinner or reset the active tab
  // out from under the user mid-session (that's what the separate membership
  // effect below is for).
  useEffect(() => {
    let cancelled = false;
    async function loadOrg() {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
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
        const roster = await organizationsService.getMembers(loadedOrg.slug);
        if (!cancelled) setMembers(roster);
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
      console.error("Failed to reload roster", err);
    }
  }, [orgSlug]);

  const handleJoin = useCallback(() => {
    // Unauthenticated → send to login, returning to this org page afterward.
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    // Authenticated non-member → reveal the accept action on the About tab.
    setJoinIntent(true);
    setActiveTab("about");
  }, [user, navigate, location.pathname]);

  const handleAccept = useCallback(async () => {
    if (!org || accepting) return;
    setAccepting(true);
    try {
      await organizationsService.joinOrganization(org.id);
      setJoinIntent(false);
      setMyRole("member");        // the join always inserts role='member'
      await reloadRoster();
    } catch (err) {
      console.error("Failed to accept the Clarity Organization Agreement", err);
      toast.error("Couldn't complete your join. Please try again.");
    } finally {
      setAccepting(false);
    }
  }, [org, accepting, reloadRoster]);

  const handleLeave = useCallback(async () => {
    if (!org) return;
    try {
      await organizationsService.leaveOrganization(org.id);
      setJoinIntent(false);
      setMyRole(null);
      await reloadRoster();
    } catch (err) {
      console.error("Failed to leave organization", err);
      toast.error("Couldn't complete leaving. Please try again.");
    }
  }, [org, reloadRoster]);

  const rosterItems = useMemo(
    () => members.map((m) => ({
      id: m.profileId,
      slug: m.slug ?? "",
      name: m.name,
      reason: m.reason ?? undefined,
      signedAt: m.acceptedAt,
      avatarColor: m.avatarColor ?? undefined,
      avatarUrl: m.avatarUrl ?? undefined,
      badge: m.role === "organizer" ? "Organizer" : undefined,
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
        <SEO title="Couldn't load organization" description="A temporary error occurred loading this page." />
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-muted-foreground">
          We couldn't load this page. Please try again.
        </p>
        <Button className="mt-6 min-h-[44px]" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Organization not found" description="This Clarity Organization does not exist." />
        <h1 className="text-2xl font-bold">Organization not found</h1>
        <p className="mt-3 text-muted-foreground">
          Check the link and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <SEO title={org.name} description={org.blurb ?? `The ${org.name} community on Clarity Pledge.`} url={`/org/${org.slug}`} />
      <div className="container mx-auto max-w-5xl space-y-8">
        <OrgHeader
          org={org}
          memberCount={members.length}
          isMember={isMember}
          showJoinCta={!joinIntent}
          onJoin={handleJoin}
          onLeave={handleLeave}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OrgTab)}>
          <TabsList>
            <TabsTrigger value="about">About</TabsTrigger>
            {org.hasEvents && <TabsTrigger value="events">Events</TabsTrigger>}
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="pt-4">
            <CoaSection
              isMember={isMember}
              showAccept={!isMember && joinIntent}
              accepting={accepting}
              onAccept={handleAccept}
            />
          </TabsContent>

          {org.hasEvents && (
            <TabsContent value="events" className="pt-4">
              <OrgEventsCalendar />
            </TabsContent>
          )}

          <TabsContent value="members" className="pt-4">
            {rosterItems.length > 0 ? (
              <PledgerGrid items={rosterItems} />
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
 * The COA (Clarity Organization Agreement) render for the About tab.
 *
 * NOTE (deviation from spec Decision 4): the bilateral AgreementCertificate
 * hardcodes its title ("Clarity Partner Agreement") and intro ("We, X and Y…") in
 * JSX (agreement-versions.ts confirms title/intro are not prop-wired), so reusing
 * it cannot emit the UI-Contract strings. This dedicated render sources the exact
 * founder-approved strings from COA_VERSIONS + the shared OathText body — reusing
 * the versioned oath without touching the paid-funnel bilateral certificate (which
 * the spec's own guardrail says the COA must never creep into).
 */
function CoaSection({
  isMember,
  showAccept,
  accepting,
  onAccept,
}: {
  isMember: boolean;
  showAccept: boolean;
  accepting: boolean;
  onAccept: () => void;
}) {
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  const sections = [coa.yourRight, coa.myPromise, coa.exception];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {!isMember && (
        <p className="text-sm font-medium text-muted-foreground">You're not a member yet</p>
      )}
      <div className="space-y-6 rounded-lg border border-border bg-card p-6 md:p-8">
        <div className="border-b border-border pb-4 text-center">
          <h2 className="text-xl font-bold md:text-2xl">{coa.title}</h2>
        </div>
        <p className="text-base leading-relaxed">{coa.intro}</p>
        {sections.map((section) => (
          <div key={section.heading} className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-blue-600">
              {section.heading}
            </h3>
            <p className="text-base leading-relaxed">
              <OathText text={section.text} boldPhrases={section.boldPhrases} variant="tailwind" />
            </p>
          </div>
        ))}
        {showAccept && (
          <div className="border-t border-border pt-4">
            <Button onClick={onAccept} disabled={accepting} className="min-h-[44px] w-full">
              I Accept &amp; Join
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Events tab — reuses the Chiang Mai Google Calendar embed (WEEK desktop / AGENDA mobile). */
function OrgEventsCalendar() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <iframe
      src={buildEmbedUrl(isDesktop ? "WEEK" : "AGENDA")}
      title="Community events calendar"
      className="block w-full rounded-lg border-0 h-[calc(100dvh-16rem)] min-h-[480px]"
    />
  );
}
