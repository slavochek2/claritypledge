/**
 * @file org-join-page.tsx
 * @description P1010: the join gate for a Clarity Organization (/org/:slug/join).
 *
 * Joining IS accepting the Clarity Organization Terms — so the terms get their own
 * focus page (mirroring /agreements/new/create) rather than living on the About tab.
 * A member is created only after the accept action here; the membership row IS the
 * acceptance record. About stays what About should be: a description of the org.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { analytics } from "@/lib/mixpanel";
import { SEO } from "@/app/components/seo";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { Button } from "@/components/ui/button";
import { FocusHeader } from "@/app/components/layout/focus-header";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { organizationsService } from "@/app/data/organizations-service";
import type { Organization } from "@/app/data/organizations-service.interface";

export function OrgJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const orgPath = `/org/${slug}`;

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
          console.error("Failed to load organization", err);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  const handleAccept = useCallback(async () => {
    if (!org || accepting) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`${orgPath}/join`)}`);
      return;
    }
    setAccepting(true);
    try {
      const { joined, termsVersion } = await organizationsService.joinOrganization(org.id);
      // Only track a real join — an already-member re-accepting terms creates no row
      // (idempotent no-op), and terms_version reports the value the DB actually stamped,
      // not the client's CURRENT_COA_VERSION constant, so it can't drift from the stored row.
      if (joined) {
        analytics.track('org_joined', { org_slug: org.slug, terms_version: termsVersion ?? CURRENT_COA_VERSION });
      }
      toast.success(`You've joined ${org.name}`);
      navigate(orgPath, { replace: true });
    } catch (err) {
      console.error("Failed to accept the Clarity Organization Terms", err);
      toast.error("Couldn't complete your join. Please try again.");
      setAccepting(false);
    }
  }, [org, accepting, user, navigate, orgPath]);

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen justify-center py-20" data-testid="loader">
        <ClarityLoader size="lg" />
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen px-4 py-20 text-center">
        <SEO title="Organization not found" description="This Clarity Organization does not exist." />
        <h1 className="text-2xl font-bold">Organization not found</h1>
        <p className="mt-3 text-muted-foreground">Check the link and try again.</p>
      </div>
    );
  }

  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  const sections = [coa.yourRight, coa.myPromise, coa.exception];

  return (
    <div className="min-h-screen px-4 pt-6 pb-16">
      <SEO
        title={`Join ${org.name}`}
        description={`Accept the Clarity Organization Terms to join ${org.name}.`}
        url={`/org/${org.slug}/join`}
      />
      <div className="mx-auto max-w-2xl space-y-6">
        <FocusHeader onBack={() => navigate(orgPath)} />
        <div>
          <h1 className="text-center text-2xl font-bold md:text-3xl">Join {org.name}</h1>
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
          ariaLabel="Clarity Organization Terms"
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
            <Button
              onClick={handleAccept}
              disabled={accepting}
              size="lg"
              className="w-full bg-[#002B5C] py-4 text-base font-semibold text-white hover:bg-[#001f45] md:py-6 md:text-lg"
            >
              {accepting ? "Joining…" : "Accept terms & join"}
            </Button>
            <p className="text-center text-[10px] text-[#1A1A1A]/60 md:text-xs">
              Accept the terms to join {org.name}.
            </p>
          </div>
        </CertificateFrame>
      </div>
    </div>
  );
}
