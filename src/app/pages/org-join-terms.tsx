/**
 * @file org-join-terms.tsx
 * @description The Clarity Group Terms on /groups/:slug/join, in its three forms: a member's accepted version
 * (read-only), a non-member reading them (read-only, P1549 decision 12) and a learner accepting them.
 */
import { Link } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { FocusHeader } from "@/app/components/layout/focus-header";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { COA_VERSIONS, CURRENT_COA_VERSION, type CoaVersion } from "@/app/content/coa-versions";
import type { Organization } from "@/app/data/organizations-service.interface";

function MemberTermsCaption({ org, myTerms, coaVersion }: { org: Organization; myTerms: { version: number; acceptedAt: string }; coaVersion: CoaVersion }) {
  return (
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
  );
}

export function OrgJoinTerms({ org, myTerms, viewTerms, joinViaLearning, showAlreadyLearned, groupName, orgPath, afterPath, carriedQuery, accepting, onAccept, goBack, onJoinFromView }: {
  org: Organization;
  myTerms: { version: number; acceptedAt: string } | null;
  viewTerms: boolean;
  joinViaLearning: boolean;
  showAlreadyLearned: boolean;
  groupName: string;
  orgPath: string;
  afterPath: string;
  carriedQuery: string;
  accepting: boolean;
  onAccept: () => void;
  goBack: () => void;
  onJoinFromView: () => void;
}) {
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
        <FocusHeader fallback={afterPath} />
        <div>
          {!myTerms && (
            <p className="mb-2 text-center text-xs text-muted-foreground" data-testid="join-terms-step">
              {joinViaLearning ? "Part 2 of 2 · Group terms" : "Group terms"}
            </p>
          )}
          <h1 className="text-center text-2xl font-bold md:text-3xl">
            {myTerms ? `${org.name} — terms` : `Join ${groupName}`}
          </h1>
          {/* The COA intro is the page subtitle, NOT a line inside the certificate.
              Stating "not legally binding" within the document made the document
              argue about its own force; above it, it frames what the reader is
              about to read. Still sourced from the versioned registry so it stays
              pinned to the terms_version a member accepted. */}
          <p className="mt-2 text-center text-muted-foreground">{coa.intro}</p>
          {showAlreadyLearned && !joinViaLearning && (
            <p className="mt-2 text-center text-sm text-muted-foreground" data-testid="already-learned">
              You&apos;ve already done the learning.{" "}
              <Link
                to={`/prepare?review=${encodeURIComponent(`${orgPath}/join${carriedQuery}`)}`}
                state={{ fromCaller: true }}
                className="inline-flex min-h-11 items-center font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
              >
                Review it
              </Link>
            </p>
          )}
          {myTerms && (
            <p className="mt-2 text-center text-sm">
              <Link
                to={`/prepare?review=${encodeURIComponent(`${orgPath}/join`)}`}
                state={{ fromCaller: true }}
                className="inline-flex min-h-11 items-center font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400"
                data-testid="review-how-we-talk"
              >
                Review how we talk
              </Link>
            </p>
          )}
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
                <MemberTermsCaption org={org} myTerms={myTerms} coaVersion={coaVersion} />
                {/* min-h-11 to match the primary Accept button on the non-member
                    branch: viewport QA measured Back at 44px and Accept at 40px, so
                    the secondary control was the taller of the two. */}
                <Button
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={goBack}
                >
                  Back to {org.name}
                </Button>
              </>
            ) : viewTerms ? (
              <Button
                size="lg"
                className="min-h-11 w-full py-4 text-base font-semibold md:py-6 md:text-lg"
                onClick={onJoinFromView}
              >
                Join {groupName}
              </Button>
            ) : (
            <>
            <Button
              onClick={onAccept}
              disabled={accepting}
              size="lg"
              className="min-h-11 w-full py-4 text-base font-semibold md:py-6 md:text-lg"
            >
              {accepting ? "Joining…" : "Accept and join"}
            </Button>
            <p className="text-center text-[10px] text-[#1A1A1A]/60 md:text-xs">
              Accept the terms to join {org.name}.
            </p>
            <div className="text-center">
              <button type="button" onClick={goBack} className="min-h-11 text-sm font-medium text-[#1A1A1A]/70 underline underline-offset-2" data-testid="terms-back">
                Back
              </button>
            </div>
            </>
            )}
          </div>
        </CertificateFrame>
      </div>
    </div>
  );
}
