/**
 * @file badge-page.tsx
 * @description Badge certificate page for ClarityPledge (P686).
 * Route: /p/:id/badge
 * Access: Public, no login required.
 * Shows the Clarity Badge certificate with progress, verified points, and certifier info.
 * Owner sees a share banner; visitors see a headline and workshop CTA.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getProfile, getProfileBySlug, type Profile } from "@/app/data/api";
import { BadgeCertificate } from "@/app/components/profile/badge-certificate";
import { ExportBadgeCertificate } from "@/app/components/profile/export-badge-certificate";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LinkIcon, ChevronDownIcon, CopyIcon, CheckIcon, LinkedinIcon, DownloadIcon, LoaderIcon } from "lucide-react";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";
import { useAuth } from "@/auth";
import { badgeService, type BadgePointDetail } from "@/app/data/badge-service";
import { copyToClipboard } from "@/lib/utils";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BadgePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [badgePoints, setBadgePoints] = useState<BadgePointDetail[]>([]);
  const [certifierProfile, setCertifierProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const { session } = useAuth();

  // Export state
  // The export component is only mounted when a download is in progress to avoid
  // having a duplicate "CLARITY BADGE" heading in the DOM (Playwright strict mode).
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportComponent, setShowExportComponent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load profile by slug first, then fall back to ID
        let profileData = await getProfileBySlug(id);
        if (!profileData) {
          profileData = await getProfile(id);
        }

        if (!profileData) {
          setProfile(null);
          return;
        }

        setProfile(profileData);

        // Load badge points with details (point statement, st-group, story content)
        const details = await badgeService.getBadgePointsWithDetails(profileData.id);

        // Collapse by st-group: keep highest version per group, ordered by verified_at
        const byStGroup = new Map<string, BadgePointDetail>();
        for (const detail of details) {
          const existing = byStGroup.get(detail.stGroup);
          if (!existing || detail.pointVersion > existing.pointVersion) {
            byStGroup.set(detail.stGroup, detail);
          }
        }
        const collapsed = Array.from(byStGroup.values()).sort(
          (a, b) => new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime()
        );
        setBadgePoints(collapsed);

        // Load certifier profile from the first badge point's verifiedBy UUID
        if (details.length > 0) {
          const certifierProfile = await getProfile(details[0].verifiedBy);
          setCertifierProfile(certifierProfile);
        }
      } catch (error) {
        console.error("BadgePage: Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  // Trigger PNG export once the export component is mounted in the DOM.
  // Must be declared here (before early returns) to avoid Rules of Hooks violation.
  useEffect(() => {
    if (!showExportComponent || !exportRef.current || !profile) return;

    let cancelled = false;
    toPng(exportRef.current, { pixelRatio: 2, cacheBust: true })
      .then((dataUrl) => {
        if (cancelled) return;
        const link = document.createElement("a");
        link.download = `clarity-badge-${profile.slug}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Badge downloaded!");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to export badge certificate:", error);
        toast.error("Failed to download. Try a screenshot instead.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsExporting(false);
        setShowExportComponent(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExportComponent, exportRef.current]);

  if (loading) {
    return <ClarityPageLoader />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">Badge Not Found</h1>
          <p className="text-muted-foreground">
            This profile doesn't exist or has been removed.
          </p>
          <Link to="/">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 0-badge case: badge page not available
  if (badgePoints.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">Badge Not Found</h1>
          <p className="text-muted-foreground">
            {profile.name} hasn't earned any badge points yet.
          </p>
          <Link to={`/p/${profile.slug}`}>
            <Button variant="outline">View Profile</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = session?.user?.id === profile.id;

  const badgeUrl = `https://claritypledge.com/p/${profile.slug}/badge`;

  // Derive certifier name and slug: use certifierProfile if loaded, otherwise fallback
  const certifierName = certifierProfile?.name ?? "ClarityPledge";
  const certifierSlug = certifierProfile?.slug ?? "";

  const handleCopyLink = async () => {
    const success = await copyToClipboard(badgeUrl);
    if (success) {
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const shareOnLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(badgeUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadCertificate = () => {
    // Mount the export component first; the useEffect (declared before early returns)
    // will trigger the actual download once exportRef.current is available.
    setIsExporting(true);
    setShowExportComponent(true);
  };

  const verifiedCount = badgePoints.length;

  return (
    <>
      <SEO
        title={`${profile.name}'s Clarity Badge`}
        description={`${profile.name} is calibrated on ${verifiedCount} of 9 clarity points.`}
        url={`/p/${profile.slug}/badge`}
        type="profile"
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-5xl py-12 px-4">
          {/* Back button */}
          <button
            onClick={() => navigate(`/p/${profile.slug}`)}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </button>

          {/* Owner banner */}
          {isOwner && (
            <div className="mb-6 flex items-center justify-between p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Your Badge
              </p>
              <div className="flex items-center gap-2">
                {/* Download Image button */}
                <button
                  onClick={handleDownloadCertificate}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900 hover:bg-blue-50 dark:hover:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-50 text-blue-800 dark:text-blue-200"
                  title="Download badge image"
                >
                  {isExporting ? (
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <DownloadIcon className="w-4 h-4" />
                  )}
                  {isExporting ? "Exporting..." : "Download Image"}
                </button>

                {/* Share dropdown */}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0044CC] hover:bg-[#0033AA] text-white transition-colors text-sm font-medium">
                      <LinkIcon className="w-4 h-4" />
                      Share
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer py-3">
                      <div className="flex items-start gap-3">
                        {copied ? (
                          <CheckIcon className="w-4 h-4 text-green-600 mt-0.5" />
                        ) : (
                          <CopyIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium">{copied ? "Copied!" : "Copy Link"}</p>
                          <p className="text-xs text-muted-foreground">Share anywhere</p>
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={shareOnLinkedIn} className="cursor-pointer py-3">
                      <div className="flex items-start gap-3">
                        <LinkedinIcon className="w-4 h-4 text-[#0A66C2] mt-0.5" />
                        <div>
                          <p className="font-medium">Share on LinkedIn</p>
                          <p className="text-xs text-muted-foreground">Open LinkedIn share</p>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Badge certificate */}
          <BadgeCertificate
            profile={{
              name: profile.name,
              slug: profile.slug ?? "",
              avatarUrl: profile.avatarUrl ?? undefined,
              avatarColor: profile.avatarColor ?? undefined,
              email: profile.email ?? undefined,
              role: profile.role ?? undefined,
            }}
            badgePoints={badgePoints}
            certifierName={certifierName}
            certifierSlug={certifierSlug}
            badgeUrl={badgeUrl}
          />

        </div>
      </div>

      {/* Hidden export certificate — only mounted when a download is triggered.
          Lazy mounting avoids having a duplicate heading text in the DOM. */}
      {showExportComponent && (
        <div
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
          }}
          aria-hidden="true"
        >
          <ExportBadgeCertificate
            ref={exportRef}
            profile={{
              name: profile.name,
              slug: profile.slug ?? "",
              avatarUrl: profile.avatarUrl ?? undefined,
              avatarColor: profile.avatarColor ?? undefined,
              email: profile.email ?? undefined,
              role: profile.role ?? undefined,
            }}
            badgePoints={badgePoints}
            certifierName={certifierName}
            certifierSlug={certifierSlug}
            badgeUrl={badgeUrl}
          />

        </div>
      )}
    </>
  );
}
