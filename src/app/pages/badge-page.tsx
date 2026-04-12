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
import { badgeService, type BadgePoint } from "@/app/data/badge-service";
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
  const [badgePoints, setBadgePoints] = useState<BadgePoint[]>([]);
  const [certifierProfile, setCertifierProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const { session } = useAuth();

  // Export state
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
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

        // Load badge points for this profile
        const points = await badgeService.getBadgePoints(profileData.id);
        setBadgePoints(points);

        // Load certifier profile from the first badge point's verifiedBy UUID
        if (points.length > 0) {
          const certifierProfile = await getProfile(points[0].verifiedBy);
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

  const handleDownloadCertificate = async () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `clarity-badge-${profile.slug}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Badge downloaded!");
    } catch (error) {
      console.error("Failed to export badge certificate:", error);
      toast.error("Failed to download. Try a screenshot instead.");
    } finally {
      setIsExporting(false);
    }
  };

  const verifiedCount = badgePoints.length;

  return (
    <>
      <SEO
        title={`${profile.name}'s Clarity Badge | ClarityPledge`}
        description={`${profile.name} is calibrated on ${verifiedCount} of 9 clarity points.`}
        url={`/p/${profile.slug}/badge`}
        type="profile"
        profile={{
          name: profile.name,
          role: profile.role,
          signedAt: badgePoints[0]?.verifiedAt,
        }}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-5xl py-12 px-4">
          {/* Back button */}
          <button
            onClick={() => navigate(`/p/${profile.slug}`)}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
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

          {/* Visitor headline */}
          {!isOwner && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {profile.name} is building calibrated alignment
              </h2>
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

          {/* Visitor CTA */}
          {!isOwner && (
            <div className="mt-8 p-6 rounded-lg border border-border bg-card text-center space-y-3">
              <h3 className="text-lg font-semibold text-foreground">
                Join the next Clarity Workshop
              </h3>
              <p className="text-sm text-muted-foreground">
                Experience the same calibration process and earn your badge.
              </p>
              <Link to="/events">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white">
                  View upcoming workshops
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Hidden export certificate — rendered off-screen for html-to-image */}
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
    </>
  );
}
