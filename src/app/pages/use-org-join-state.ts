/**
 * @file use-org-join-state.ts
 * @description P1010/P1076: what /groups/:slug/join knows: the group, this person's membership and the accept action.
 * Moved out of org-join-page.tsx when P1549 added the choice of screen. Which screen shows stays in the page.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { analytics } from "@/lib/mixpanel";
import { CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { organizationsService } from "@/app/data/organizations-service";
import type { Organization } from "@/app/data/organizations-service.interface";
import { isValidUUID } from "@/lib/auth-gate-utils";
import { inAppPath } from "@/lib/in-app-path";

export function useOrgJoinState(slug: string | undefined) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [membershipFailed, setMembershipFailed] = useState(false);
  const [membershipAttempt, setMembershipAttempt] = useState(0);
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
  // P1389: ?return={in-app path} — a flow that sent the person here (the evening close) gets them
  // back after joining or on Back. In-app paths only; anything else falls back to the group page.
  const rawReturn = searchParams.get("return");
  const returnPath = inAppPath(rawReturn) ?? undefined;
  const afterPath = returnPath ?? orgPath;
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
    setMembershipFailed(false);
    setMembershipChecked(false); // re-check if orgId/userId changes under an existing mount
    // Must be cleared with it. This page does not remount when the slug changes
    // (same route pattern) and survives sign-out and user switches, so a stale
    // `true` would (a) show an anonymous visitor "You are a member", and (b) leave
    // a DIFFERENT signed-in user permanently unable to join, since the read-only
    // branch renders no accept action.
    setMyTerms(null);
    async function checkExistingMembership() {
      try {
        const mine = await organizationsService.getMyMembership(orgId as string);
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
          navigate(afterPath, { replace: true });
          return;
        }
        setMyTerms({ version: mine.termsVersion, acceptedAt: mine.acceptedAt });
      } catch (err) {
        console.error("Failed to check existing membership", err);
        if (!cancelled) setMembershipFailed(true);
      } finally {
        if (!cancelled) setMembershipChecked(true);
      }
    }
    checkExistingMembership();
    return () => { cancelled = true; };
  }, [orgId, userId, navigate, afterPath, fromProfileId, membershipAttempt]);

  const handleAccept = useCallback(async () => {
    if (!org || accepting) return;
    if (!user) {
      const query = new URLSearchParams();
      if (fromProfileId) query.set("from", fromProfileId);
      if (returnPath) query.set("return", returnPath);
      const joinPath = `${orgPath}/join${query.size ? `?${query}` : ""}`;
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
      navigate(afterPath, { replace: true, state: { justJoined: true } });
    } catch (err) {
      console.error("Failed to accept the Clarity Group Terms", err);
      toast.error("Couldn't complete your join. Please try again.");
      setAccepting(false);
    }
  }, [org, accepting, user, navigate, orgPath, afterPath, returnPath, fromProfileId]);

  const retryMembership = useCallback(() => setMembershipAttempt((n) => n + 1), []);

  return { org, loading, notFound, accepting, authLoading, checkingMembership, membershipFailed, retryMembership, myTerms, userId, rawFrom, returnPath, afterPath, orgPath, handleAccept };
}
