import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { QRCodeSVG } from "qrcode.react";
import { ClarityLogoMark } from "@/components/ui/clarity-logo";
import { Check, Circle } from "lucide-react";
import type { BadgePoint } from "@/app/data/badge-service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BadgePointReference {
  stationTag: string; // e.g. 'st1'
  pointId: string;    // canonical point ID for this station
  title: string;      // point statement / title
}

export interface BadgeCertificateProps {
  profile: {
    name: string;
    slug: string;
    avatarUrl?: string;
    avatarColor?: string;
    email?: string;
    role?: string;
  };
  badgePoints: BadgePoint[];
  certifierName: string;
  certifierSlug: string;
  badgePointsReference?: BadgePointReference[];
  /** Badge public URL for QR code */
  badgeUrl?: string;
  /** Actual point titles fetched from DB, keyed by pointId */
  pointTitles?: Record<string, string>;
}

// ── Canonical stations (9 total, one per station, simplest version) ────────────
// Source: docs/technical/badge-points-reference.md

const CANONICAL_BADGE_STATIONS: BadgePointReference[] = [
  {
    stationTag: "st1",
    pointId: "6d253c2b-32b1-4a10-826c-4a4844b23e14",
    title:
      'Most people assume understanding is binary — you either get it or you don\'t. "Understand" covers at least three distinct cognitive states.',
  },
  {
    stationTag: "st2",
    pointId: "b8e371b7-52bc-4229-80a1-841c64aa03cd",
    title:
      "My estimates of how well I understand others are unreliable. Without verification, I have no error signal.",
  },
  {
    stationTag: "st3",
    pointId: "86fb9e04-e04d-4399-9928-83fd8da9ab03",
    title:
      "The speaker knows what they meant to communicate. The listener doesn't. The only way to verify cognitive understanding is to check.",
  },
  {
    stationTag: "st4",
    pointId: "a0096d98-768d-46c3-832d-ba104a31282c",
    title:
      "The listener explains back what they think the speaker meant. If they express judgment or criticism while doing so, verification fails.",
  },
  {
    stationTag: "st5",
    pointId: "cb114d49-21eb-409d-afb1-19e40b9ba36c",
    title:
      "Two people can hold exactly the same belief and be uncertain if the other holds it or not. That's a shared belief gap.",
  },
  {
    stationTag: "st6",
    pointId: "978f7a1e-5e80-41b7-aed5-35cfcd14a379",
    title:
      "When interests clash in a conversation and one party pursues agreement or emotional validation, understanding cannot be verified.",
  },
  {
    stationTag: "st7",
    pointId: "b5e50000-0000-4000-b000-000000000005",
    title:
      "Once two people both understand the process of how to reach verified cognitive understanding and both know the other knows, the conversation changes.",
  },
  {
    stationTag: "st8",
    pointId: "1fe66b60-0d82-43a9-8d71-437453da6b12",
    title:
      "I am highly motivated to increase my capacity to distinguish what I understand and what I don't understand in conversations.",
  },
  {
    stationTag: "st9",
    pointId: "b5e70000-0000-4000-b000-000000000007",
    title:
      "If you understand how cognitive understanding works and why it matters, the ClarityPledge is making that commitment public.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEarliestDate(badgePoints: BadgePoint[]): string | null {
  if (badgePoints.length === 0) return null;
  const sorted = [...badgePoints].sort(
    (a, b) => new Date(a.verifiedAt).getTime() - new Date(b.verifiedAt).getTime()
  );
  return sorted[0].verifiedAt;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BadgeCertificate({
  profile,
  badgePoints,
  certifierName,
  certifierSlug,
  badgePointsReference = CANONICAL_BADGE_STATIONS,
  badgeUrl,
  pointTitles = {},
}: BadgeCertificateProps) {
  const verifiedCount = badgePoints.length;
  const earliestDate = getEarliestDate(badgePoints);

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
            Verified understanding of common knowledge creation
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

        {/* ── Point list ────────────────────────────────────────────────── */}
        <ul aria-label="Clarity badge points" className="space-y-2">
          {/* Earned badge points not matching any canonical station (e.g. custom points) */}
          {badgePoints
            .filter((bp) => !badgePointsReference.some((s) => s.pointId === bp.pointId))
            .map((bp) => {
              const title = pointTitles[bp.pointId] ?? "Verified clarity point";
              return (
                <li
                  key={bp.id}
                  aria-label={`Verified: ${title}, ${formatDate(bp.verifiedAt)}`}
                  className="flex items-start gap-3 text-sm"
                >
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 w-4 h-4 shrink-0 text-[#002B5C] dark:text-blue-400"
                  />
                  <span className="flex-1 leading-snug">
                    <a
                      href={`/point/${bp.pointId}`}
                      className="text-[#1A1A1A] dark:text-foreground hover:text-[#0044CC] hover:underline transition-colors"
                    >
                      {title}
                    </a>
                    <span className="ml-2 text-xs text-[#1A1A1A]/50 dark:text-muted-foreground whitespace-nowrap">
                      {formatDate(bp.verifiedAt)}
                    </span>
                  </span>
                </li>
              );
            })}
          {/* Canonical badge stations */}
          {badgePointsReference.map((station) => {
            const earned = badgePoints.find(
              (bp) => bp.pointId === station.pointId
            );
            // Use actual DB title if available, otherwise fall back to canonical title
            const displayTitle = earned && pointTitles[station.pointId]
              ? pointTitles[station.pointId]
              : station.title;
            return (
              <li
                key={station.stationTag}
                aria-label={
                  earned
                    ? `Verified: ${displayTitle}, ${formatDate(earned.verifiedAt)}`
                    : `Not yet verified: ${station.title}`
                }
                className="flex items-start gap-3 text-sm"
              >
                {earned ? (
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 w-4 h-4 shrink-0 text-[#002B5C] dark:text-blue-400"
                  />
                ) : (
                  <Circle
                    aria-hidden="true"
                    className="mt-0.5 w-4 h-4 shrink-0 text-[#1A1A1A]/30 dark:text-muted-foreground/40"
                  />
                )}
                <span className="flex-1 leading-snug">
                  {earned ? (
                    <a
                      href={`/point/${station.pointId}`}
                      className="text-[#1A1A1A] dark:text-foreground hover:text-[#0044CC] hover:underline transition-colors"
                    >
                      {displayTitle}
                    </a>
                  ) : (
                    <span className="text-[#1A1A1A]/50 dark:text-muted-foreground">
                      {station.title}
                    </span>
                  )}
                  {earned && (
                    <span className="ml-2 text-xs text-[#1A1A1A]/50 dark:text-muted-foreground whitespace-nowrap">
                      {formatDate(earned.verifiedAt)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {/* ── Signature footer ──────────────────────────────────────────── */}
        <div className="pt-8 border-t-2 border-[#002B5C] dark:border-border">
          {/* Mobile: stacked centered layout */}
          <div className="flex flex-col items-center gap-6 md:hidden">
            {/* Seal */}
            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg">
              <ClarityLogoMark size={72} className="text-[#1A1A1A] dark:text-foreground" />
            </div>

            {/* Name + role */}
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

            {/* Date */}
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

            {/* QR code — mobile hidden per spec (hidden md:block means desktop only) */}
          </div>

          {/* Desktop: horizontal balanced layout */}
          <div className="hidden md:flex items-center gap-8">
            {/* Left: Avatar + name + role */}
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

            {/* Center: Seal */}
            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg flex-shrink-0">
              <ClarityLogoMark size={72} className="text-[#1A1A1A] dark:text-foreground" />
            </div>

            {/* Right: QR code (desktop only per spec) */}
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
