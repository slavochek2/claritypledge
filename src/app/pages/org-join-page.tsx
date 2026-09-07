/**
 * @file org-join-page.tsx
 * @description P1010: the join gate for a Clarity Group (/groups/:slug/join).
 *
 * Joining IS accepting the Clarity Group Terms — so the terms get their own
 * focus page (mirroring /agreements/new/create) rather than living on the About tab.
 * A member is created only after the accept action here; the membership row IS the
 * acceptance record. About stays what About should be: a description of the org.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { Button } from "@/components/ui/button";
import { FocusHeader } from "@/app/components/layout/focus-header";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { COA_VERSIONS, CURRENT_COA_VERSION, type CoaVersion } from "@/app/content/coa-versions";
import { organizationsService } from "@/app/data/organizations-service";
import type { Organization } from "@/app/data/organizations-service.interface";
import { isValidUUID } from "@/lib/auth-gate-utils";

export function OrgJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [membershipChecked, setMembershipChecked] = useState(false);
  // Members are no longer bounced off this page (see the membership effect below):
  // this flag turns it into the group's read-only terms surface for them.
  // null = not a member (or not yet known). Non-null = the member's OWN accepted
  // terms, which is what this page renders for them — never the current version.
  const [myTerms, setMyTerms] = useState<{ version: number; acceptedAt: string } | null>(null);

  const orgPath = `/groups/${slug}`;
  const orgId = org?.id ?? null;
  const userId = user?.id ?? null;
  // Derived, not effect-set: true the instant orgId+userId are both known, on the
  // SAME render — an effect-driven flag would only flip after a post-paint effect
  // runs, letting the terms UI flash for one frame first (org-page.tsx's sibling
  // membership check hits the same class of bug and is keyed on these same scalars,
  // not the user object, for the same reason: object identity is not what changed).
  const checkingMembership = Boolean(orgId) && Boolean(userId) && !membershipChecked;

  // P1076: ?from={inviter profile id} — silent attribution only, never displayed.
  // Malformed input is dropped client-side (a non-UUID value would otherwise error
  // the insert's type cast); a well-formed but nonexistent id is nulled server-side
  // by the membership_validate_invited_by trigger. The link joins identically either way.
  const rawFrom = searchParams.get("from");
  const fromProfileId = rawFrom && isValidUUID(rawFrom) ? rawFrom : undefined;

  // Unauthenticated visitors can READ the terms; only the accept action requires
  // an account, so the login redirect happens on click, not on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!slug) return;
      setLoading(true);
      try {
        const loaded = await organizationsService.getOrganizationBySlug(slug);
        if (cancelled) return;
        if (!loaded) setNotFound(true);
        else setOrg(loaded);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load group", err);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  // Was: route an existing member straight back to the org page, so the invite link
  // never re-showed terms they had already accepted. That solved the confusing
  // re-accept screen by removing the page — which left members with NO way to read
  // what they had committed to, and made the About tab's "Clarity Group Terms" link
  // a silent bounce (click, return, nothing shown). REVERSED deliberately: the same
  // problem is better solved by rendering the terms READ-ONLY, with the accept
  // action replaced by a way back. Signed-out visitors are unaffected — they still
  // read the terms freely, per the existing unauthenticated flow.
  useEffect(() => {
    // Signed out, or the org is not loaded yet: nobody is a member of anything here.
    if (!orgId || !userId) { setMyTerms(null); return; }
    let cancelled = false;
    setMembershipChecked(false); // re-check if orgId/userId changes under an existing mount
    // Must be cleared with it. This page does not remount when the slug changes
    // (same route pattern) and survives sign-out and user switches, so a stale
    // `true` would (a) show an anonymous visitor "You are a member", and (b) leave
    // a DIFFERENT signed-in user permanently unable to join, since the read-only
    // branch renders no accept action.
    setMyTerms(null);
    async function checkExistingMembership() {
      try {
        const mine = await organizationsService.getMyMembership(orgId);
        if (cancelled || !mine) return;
        // Two ways a member reaches this page, and they want opposite things.
        //   · WITH ?from= — they followed an invite, or the signup callback just
        //     auto-joined them and bounced them through here. The invite is spent;
        //     sending them to the group is the completion of that journey (and the
        //     post-join banner lives there). Redirect, as before.
        //   · WITHOUT ?from= — they deliberately opened the terms, almost always
        //     via the About tab's "Clarity Group Terms" link. Show them.
        // Collapsing these two was the original bug: the redirect served the invite
        // case and made the terms link a silent no-op for everyone else.
        if (fromProfileId) {
          navigate(orgPath, { replace: true });
          return;
        }
        setMyTerms({ version: mine.termsVersion, acceptedAt: mine.acceptedAt });
      } catch (err) {
        console.error("Failed to check existing membership", err);
      } finally {
        if (!cancelled) setMembershipChecked(true);
      }
    }
    checkExistingMembership();
    return () => { cancelled = true; };
  }, [orgId, userId, navigate, orgPath, fromProfileId]);

  const handleAccept = useCallback(async () => {
    if (!org || accepting) return;
    if (!user) {
      const joinPath = `${orgPath}/join${fromProfileId ? `?from=${fromProfileId}` : ""}`;
      // action=join-org is the explicit signal AuthCallbackPage requires before it
      // will auto-join on a redirect — never on a bare /groups redirect (spec Risk
      // mitigation: auto-join must not be an accidental side effect of navigation).
      // Targets /signup, not /login (P1076 session revision, 2026-08): a cold invite
      // recipient almost never has an existing account, so defaulting to the signup
      // form removes a needless tap. signup-page.tsx already forwards redirect/action
      // through its own PKCE magic-link send and offers a "switch to login" toggle
      // (mirrors login-page's existing "switch to signup" toggle), so an invitee who
      // DOES already have an account isn't stuck.
      navigate(`/signup?redirect=${encodeURIComponent(joinPath)}&action=join-org`);
      return;
    }
    setAccepting(true);
    try {
      const { joined, termsVersion } = await organizationsService.joinOrganization(org.id, fromProfileId);
      // Only track a real join — an already-member re-accepting terms creates no row
      // (idempotent no-op), and terms_version reports the value the DB actually stamped,
      // not the client's CURRENT_COA_VERSION constant, so it can't drift from the stored row.
      if (joined) {
        analytics.track('org_joined', { org_slug: org.slug, terms_version: termsVersion ?? CURRENT_COA_VERSION });
      }
      toast.success(`You've joined ${org.name}`);
      navigate(orgPath, { replace: true, state: { justJoined: true } });
    } catch (err) {
      console.error("Failed to accept the Clarity Group Terms", err);
      toast.error("Couldn't complete your join. Please try again.");
      setAccepting(false);
    }
  }, [org, accepting, user, navigate, orgPath, fromProfileId]);

  if (loading || authLoading || checkingMembership) {
    return (
      <div className="flex min-h-screen justify-center py-20" data-testid="loader">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Group not found" description="This Clarity Group does not exist." />
        <h1 className="text-2xl font-bold">Group not found</h1>
        <p className="mt-3 text-muted-foreground">Check the link and try again.</p>
      </div>
    );
  }

  // A member reads the version they accepted; everyone else reads the current one.
  // The registry keeps every version forever precisely so this is possible
  // (coa-versions.ts) — rendering CURRENT to a member pinned to an older version
  // would show them a document they never agreed to, under their own acceptance.
  // Falls back to CURRENT if a row somehow holds a version the registry lost.
  const coaVersion = (myTerms && (myTerms.version in COA_VERSIONS)
    ? (myTerms.version as CoaVersion)
    : CURRENT_COA_VERSION);
  const coa = COA_VERSIONS[coaVersion];
  const sections = [coa.yourRight, coa.myPromise, coa.exception];

  return (
    <div className="min-h-screen px-4 pt-6 pb-16">
      <SEO
        title={`Join ${org.name}`}
        description={`Accept the Clarity Group Terms to join ${org.name}.`}
        url={`/groups/${org.slug}/join`}
      />
      <div className="mx-auto max-w-2xl space-y-6">
        <FocusHeader onBack={() => navigate(orgPath)} />
        <div>
          <h1 className="text-center text-2xl font-bold md:text-3xl">
            {myTerms ? `${org.name} — terms` : `Join ${org.name}`}
          </h1>
          {/* The COA intro is the page subtitle, NOT a line inside the certificate.
              Stating "not legally binding" within the document made the document
              argue about its own force; above it, it frames what the reader is
              about to read. Still sourced from the versioned registry so it stays
              pinned to the terms_version a member accepted. */}
          <p className="mt-2 text-center text-muted-foreground">{coa.intro}</p>
        </div>

        {/* Same certificate shell as the bilateral Clarity Partner Agreement
            (certificate-frame.tsx) — one visual language for every commitment. */}
        <CertificateFrame
          ariaLabel="Clarity Group Terms"
          title={coa.title}
          kicker="A commitment to every member"
          epigraph="We all crave being understood. Let's commit to listen."
        >
          <CertificateOathBody sections={sections} />

          {/* Accept lives INSIDE the frame, in the certificate's navy — the same
              construction as the pledge, where the submit button sits within the
              bordered field (sign-pledge-form.tsx). A blue button floating below
              the frame read as unrelated page chrome; here the act of accepting
              is visibly part of the document being accepted. */}
          <div className="space-y-2 pt-2">
            {myTerms ? (
              /* Read-only for members. No accept action: they already accepted, and a
                 second Accept would be an idempotent no-op wearing a primary button.
                 The certificate above renders THEIR version (see coaVersion), so the
                 caption can name the date and version honestly. The one case it
                 cannot is a row holding a version the registry no longer has: there
                 the document shown is not theirs, so the copy drops back to the
                 neutral form rather than dating a claim about a document nobody
                 can produce. */
              <>
                <p className="text-center text-sm text-muted-foreground">
                  {coaVersion === myTerms.version ? (
                    <>
                      You accepted these terms on{" "}
                      {new Date(myTerms.acceptedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      . This is version {myTerms.version}, the one you agreed to
                      {coaVersion !== CURRENT_COA_VERSION
                        ? `; the group's current terms are version ${CURRENT_COA_VERSION}.`
                        : "."}
                    </>
                  ) : (
                    <>
                      You are a member of {org.name}. These are the terms this group
                      runs on; the version you accepted is no longer on record here.
                    </>
                  )}
                </p>
                {/* min-h-11 to match the primary Accept button on the non-member
                    branch: viewport QA measured Back at 44px and Accept at 40px, so
                    the secondary control was the taller of the two. */}
                <Button
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => navigate(orgPath)}
                >
                  Back to {org.name}
                </Button>
              </>
            ) : (
            <>
            <Button
              onClick={handleAccept}
              disabled={accepting}
              size="lg"
              className="min-h-11 w-full bg-[#002B5C] py-4 text-base font-semibold text-white hover:bg-[#001f45] md:py-6 md:text-lg"
            >
              {accepting ? "Joining…" : "Accept terms & join"}
            </Button>
            <p className="text-center text-[10px] text-[#1A1A1A]/60 md:text-xs">
              Accept the terms to join {org.name}.
            </p>
            </>
            )}
          </div>
        </CertificateFrame>
      </div>
    </div>
  );
}
