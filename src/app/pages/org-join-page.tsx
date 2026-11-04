/**
 * @file org-join-page.tsx
 * @description P1010: the join gate for a Clarity Group (/groups/:slug/join).
 *
 * Joining IS accepting the Clarity Group Terms — so the terms get their own
 * focus page (mirroring /agreements/new/create) rather than living on the About tab.
 * A member is created only after the accept action here; the membership row IS the
 * acceptance record. About stays what About should be: a description of the org.
 */
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { FocusHeader } from "@/app/components/layout/focus-header";
import { useGoBack } from "@/app/hooks/use-go-back";
import { hasLearned } from "@/app/prototypes/events/prep/prep-plan";
import { useLearnedRead } from "@/app/prototypes/events/prep/use-learned-read";
import { shortCommunityName } from "@/app/prototypes/events/use-event-community";
import { JoinPart1, JoinReadError } from "./org-join-part1";
import { OrgJoinTerms } from "./org-join-terms";
import { useOrgJoinState } from "./use-org-join-state";

/** ?from= and ?return= travel with the person through the learning and back. */
function carriedParams(from: string | null, returnPath: string | undefined) {
  const carried = new URLSearchParams();
  if (from) carried.set("from", from);
  if (returnPath) carried.set("return", returnPath);
  return carried;
}

export function OrgJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const joinViaLearning = (location.state as { joinViaLearning?: boolean } | null)?.joinViaLearning === true;
  const viewTerms = searchParams.get("view") === "terms";
  const { org, loading, notFound, accepting, authLoading, checkingMembership, membershipFailed, retryMembership, myTerms, userId, rawFrom, returnPath, afterPath, orgPath, handleAccept } = useOrgJoinState(slug);
  // Back (and the member's "Back to <group>") returns the way the person came: a POP when the group (or the
  // flow named by ?return=) opened this page, so that page's own Back does not land here again; only a cold
  // arrival takes the group page, with replace.
  const goBack = useGoBack(afterPath);

  // P1549: only a non-member's screen depends on the learning, and the read-only terms do not.
  const needsLearned = !loading && !authLoading && !!org && !checkingMembership && !membershipFailed && !myTerms && !viewTerms;
  const learned = useLearnedRead(userId ?? undefined, needsLearned);

  // P1586: nothing of the page is drawn yet, so the one page loader.
  if (loading || authLoading || checkingMembership) return <ClarityPageLoader />;

  if (notFound || !org) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Group not found" description="This Clarity Group does not exist." />
        {/* The join page hides the phone bottom bar, so even the dead end keeps a way out (the flow that sent
            the person here, else the groups list: there is no group page to go back to). */}
        <div className="text-left"><FocusHeader fallback={returnPath ?? "/groups"} /></div>
        <h1 className="text-2xl font-bold">Group not found</h1>
        <p className="mt-3 text-muted-foreground">Check the link and try again.</p>
      </div>
    );
  }

  if (membershipFailed) return <JoinReadError onRetry={retryMembership} fallback={afterPath} />;

  const groupName = shortCommunityName(org.name);
  const carried = carriedParams(rawFrom, returnPath);
  const carriedQuery = carried.size ? `?${carried}` : "";
  const showTermsToAccept = needsLearned && learned.status === "ok" && hasLearned(learned.parts, learned.completedAt);

  if (needsLearned) {
    if (learned.status === "pending") return <ClarityPageLoader />;
    if (learned.status === "error") return <JoinReadError onRetry={learned.retry} fallback={afterPath} />;
    if (!showTermsToAccept) {
      return (
        <JoinPart1
          groupName={org.name}
          parts={learned.parts}
          viewerId={userId ?? undefined}
         
          fallback={afterPath}
          onStart={() => {
            const q = new URLSearchParams(carried);
            q.set("then", "join");
            q.set("group", org.slug);
            navigate(`/prepare?${q}`, { replace: true });
          }}
        />
      );
    }
  }

  return (
    <OrgJoinTerms
      org={org}
      myTerms={myTerms}
      viewTerms={viewTerms}
      joinViaLearning={joinViaLearning}
      showAlreadyLearned={showTermsToAccept}
      groupName={groupName}
      orgPath={orgPath}
      afterPath={afterPath}
      carriedQuery={carriedQuery}
      accepting={accepting}
      onAccept={handleAccept}
      goBack={goBack}
      onJoinFromView={() => navigate(`${orgPath}/join${carriedQuery}`, { replace: true })}
    />
  );
}
