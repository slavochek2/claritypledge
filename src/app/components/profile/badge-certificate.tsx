import { useState } from "react";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { QRCodeSVG } from "qrcode.react";
import { ClarityLogoMark } from "@/components/ui/clarity-logo";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BadgePointDetail } from "@/app/data/badge-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BadgeCertificateProps {
  profile: {
    name: string;
    slug: string;
    avatarUrl?: string;
    avatarColor?: string;
    email?: string;
    role?: string;
  };
  /** Collapsed badge points (one per st-group, highest version). Ordered by verifiedAt. */
  badgePoints: BadgePointDetail[];
  certifierName: string;
  certifierSlug: string;
  /** Badge public URL for QR code */
  badgeUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEarliestDate(badgePoints: BadgePointDetail[]): string | null {
  if (badgePoints.length === 0) return null;
  return badgePoints[0].verifiedAt; // already sorted ascending by badge-page.tsx
}

function storyExcerpt(content: string, maxLen = 110): string {
  const trimmed = content.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trimEnd() + "…" : trimmed;
}

function positionLabel(position: string): string {
  return position === "strongly_agree" ? "Strongly Agrees" : "Agrees";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BadgeCertificate({
  profile,
  badgePoints,
  certifierName,
  certifierSlug,
  badgeUrl,
}: BadgeCertificateProps) {
  const verifiedCount = badgePoints.length;
  const earliestDate = getEarliestDate(badgePoints);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="relative rounded-lg p-8 md:p-12 bg-[#FDFBF7] dark:bg-card shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
      style={{
        border: "8px solid #002B5C",
        outline: "2px solid #002B5C",
        outlineOffset: "-12px",
      }}
    >
      <div className="space-y-8">
        {/* ── Title ─────────────────────────────────────────────────────── */}
        <div className="text-center space-y-2 pb-6 border-b-2 border-[#002B5C] dark:border-border">
          <h2
            className="text-3xl md:text-4xl font-serif tracking-wide text-[#1A1A1A] dark:text-foreground uppercase"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            CLARITY BADGE
          </h2>
          <p className="text-xs text-[#1A1A1A]/60 dark:text-muted-foreground uppercase tracking-[0.2em] font-sans">
            Verified understanding of common belief creation
          </p>
        </div>

        {/* ── Progress bar ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div
            role="progressbar"
            aria-valuenow={verifiedCount}
            aria-valuemin={0}
            aria-valuemax={9}
            aria-label={`Badge progress: ${verifiedCount} of 9 clarity points verified`}
            className="flex gap-1"
          >
            {Array.from({ length: 9 }, (_, i) => (
              <div
                key={i}
                className={`h-3 flex-1 rounded-sm ${
                  i < verifiedCount
                    ? "bg-[#002B5C] dark:bg-blue-400"
                    : "bg-[#002B5C]/20 dark:bg-blue-400/20"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-center text-[#1A1A1A]/60 dark:text-muted-foreground font-mono">
            {verifiedCount}/9
          </p>
        </div>

        {/* ── Summary + verifier ───────────────────────────────────────── */}
        <div className="space-y-1 text-base text-[#1A1A1A] dark:text-foreground">
          <p>
            {verifiedCount === 9
              ? `${profile.name} is calibrated on all 9 clarity points.`
              : `${profile.name} is calibrated on ${verifiedCount} of 9 clarity points.`}
          </p>
          <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground">
            Verified by{" "}
            <a
              href={`/p/${certifierSlug}`}
              className="underline hover:text-[#0044CC] transition-colors"
            >
              {certifierName}
            </a>
            .
          </p>
        </div>

        {/* ── Earned point list ─────────────────────────────────────────── */}
        <ul aria-label="Clarity badge points" className="space-y-3">
          {badgePoints.map(bp => {
            const isExpanded = expandedIds.has(bp.id);
            return (
              <li
                key={bp.id}
                className="rounded-lg border border-[#002B5C]/20 dark:border-border overflow-hidden"
              >
                {/* Story excerpt — always visible */}
                {bp.storyId && bp.storyContent && (
                  <a
                    href={`/story/${bp.storyId}`}
                    className="block px-4 pt-3 pb-2 text-sm text-[#1A1A1A]/80 dark:text-foreground/80 italic leading-snug hover:text-[#0044CC] dark:hover:text-blue-400 transition-colors"
                    aria-label="View story"
                  >
                    "{storyExcerpt(bp.storyContent)}"
                  </a>
                )}

                {/* Toggle row */}
                <button
                  onClick={() => toggle(bp.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#1A1A1A]/70 dark:text-muted-foreground hover:text-[#0044CC] dark:hover:text-blue-400 transition-colors border-t border-[#002B5C]/10 dark:border-border"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
                  ) : (
                    <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                  )}
                  <span>1 point</span>
                  <span className="text-[#1A1A1A]/40 dark:text-muted-foreground/50">·</span>
                  <span>
                    Verified by{" "}
                    <a
                      href={`/p/${certifierSlug}`}
                      className="underline hover:text-[#0044CC] transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {certifierName}
                    </a>
                  </span>
                  <span className="text-[#1A1A1A]/40 dark:text-muted-foreground/50">·</span>
                  <span className="whitespace-nowrap">{formatDate(bp.verifiedAt)}</span>
                </button>

                {/* Expanded: position pill + point text */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-[#002B5C]/10 dark:border-border bg-[#002B5C]/[0.03] dark:bg-muted/20">
                    {/* Position row */}
                    <div className="flex items-center gap-3 mb-3">
                      <GravatarAvatar
                        name={profile.name}
                        photoUrl={profile.avatarUrl ?? undefined}
                        avatarColor={profile.avatarColor}
                        isPledger={false}
                      />
                      <span className="text-sm font-medium text-[#1A1A1A] dark:text-foreground">
                        {profile.name}
                      </span>
                      <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-[#002B5C]/10 dark:bg-blue-900/30 text-[#002B5C] dark:text-blue-300">
                        {positionLabel(bp.position)} ✓
                      </span>
                    </div>

                    {/* Point statement */}
                    <a
                      href={`/point/${bp.pointId}`}
                      className="block text-sm text-[#1A1A1A] dark:text-foreground leading-relaxed hover:text-[#0044CC] dark:hover:text-blue-400 hover:underline transition-colors"
                    >
                      "{bp.pointStatement}"
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* ── Signature footer ──────────────────────────────────────────── */}
        <div className="pt-8 border-t-2 border-[#002B5C] dark:border-border">
          {/* Mobile: stacked centered layout */}
          <div className="flex flex-col items-center gap-6 md:hidden">
            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg">
              <ClarityLogoMark size={72} className="text-[#1A1A1A] dark:text-foreground" />
            </div>
            <div className="text-center">
              <a
                href={`/p/${profile.slug}`}
                className="text-xl font-semibold text-[#1A1A1A] dark:text-foreground hover:text-[#0044CC] hover:underline transition-colors"
              >
                {profile.name}
              </a>
              {profile.role && (
                <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground mt-1">
                  {profile.role}
                </p>
              )}
            </div>
            {earliestDate && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Since
                </p>
                <p className="text-base font-semibold text-[#1A1A1A] dark:text-foreground">
                  {formatDate(earliestDate)}
                </p>
              </div>
            )}
          </div>

          {/* Desktop: horizontal balanced layout */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex-1 flex items-center gap-4">
              <a href={`/p/${profile.slug}`} className="flex items-center gap-4 group/sig">
                <GravatarAvatar
                  name={profile.name}
                  photoUrl={profile.avatarUrl ?? undefined}
                  avatarColor={profile.avatarColor}
                  isPledger={false}
                />
                <div>
                  <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-foreground leading-tight group-hover/sig:text-[#0044CC] group-hover/sig:underline transition-colors">
                    {profile.name}
                  </h3>
                  {profile.role && (
                    <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground mt-0.5">
                      {profile.role}
                    </p>
                  )}
                  {earliestDate && (
                    <p className="text-xs text-[#1A1A1A]/50 dark:text-muted-foreground mt-0.5">
                      Since {formatDate(earliestDate)}
                    </p>
                  )}
                </div>
              </a>
            </div>

            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg flex-shrink-0">
              <ClarityLogoMark size={72} className="text-[#1A1A1A] dark:text-foreground" />
            </div>

            {badgeUrl ? (
              <div className="flex-1 flex justify-end">
                <div className="bg-white p-2 rounded">
                  <QRCodeSVG value={badgeUrl} size={80} level="M" />
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
