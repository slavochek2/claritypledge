import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BadgeCertificateProps, BadgePointReference } from "./badge-certificate";
import type { BadgePoint } from "@/app/data/badge-service";

// ── Canonical stations (9 total, one per station) ─────────────────────────────
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

function isEarned(station: BadgePointReference, badgePoints: BadgePoint[]): boolean {
  return badgePoints.some((bp) => bp.pointId === station.pointId);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

// ── Inline SVG seal (matches export-certificate.tsx pattern) ──────────────────
function SealSvg() {
  return (
    <div
      style={{
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        border: "4px solid #1A1A1A",
        backgroundColor: "#FDFBF7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(26, 26, 26, 0.2)",
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="64" cy="64" r="64" fill="#3b82f6" />
        <path
          d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
          stroke="white"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Fixed-size badge certificate component for PNG export.
 * Renders at 1080x1080 pixels with inline styles for html-to-image compatibility.
 * No Tailwind classes — html-to-image ignores CSS class-based styling.
 */
export const ExportBadgeCertificate = forwardRef<HTMLDivElement, BadgeCertificateProps>(
  (
    {
      profile,
      badgePoints,
      certifierName,
      badgePointsReference = CANONICAL_BADGE_STATIONS,
      badgeUrl,
    },
    ref
  ) => {
    const verifiedCount = badgePoints.length;
    const totalStations = 9;

    // Use production domain for QR code (export is for sharing externally)
    const qrUrl = badgeUrl ?? `https://claritypledge.com/p/${profile.slug}`;

    const displayName =
      profile.name.length > 30 ? profile.name.slice(0, 27) + "..." : profile.name;

    return (
      <div
        ref={ref}
        style={{
          width: "1080px",
          height: "1080px",
          padding: "60px",
          backgroundColor: "#FDFBF7",
          border: "8px solid #002B5C",
          outline: "2px solid #002B5C",
          outlineOffset: "-16px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <div
          style={{
            textAlign: "center",
            paddingBottom: "24px",
            borderBottom: "3px solid #002B5C",
            marginBottom: "28px",
          }}
        >
          <h2
            style={{
              fontSize: "44px",
              fontWeight: "400",
              letterSpacing: "0.08em",
              color: "#1A1A1A",
              margin: "0 0 10px 0",
              fontFamily: "Georgia, serif",
              textTransform: "uppercase",
            }}
          >
            Clarity Badge
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(26, 26, 26, 0.6)",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              margin: 0,
            }}
          >
            [FOUNDER DECISION: subtitle]
          </p>
        </div>

        {/* ── Progress bar ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "20px" }}>
          {/* 9 rectangles */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            {Array.from({ length: totalStations }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: "14px",
                  borderRadius: "3px",
                  backgroundColor: i < verifiedCount ? "#002B5C" : "rgba(0, 43, 92, 0.18)",
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontSize: "14px",
              color: "rgba(26, 26, 26, 0.55)",
              textAlign: "center",
              margin: 0,
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          >
            {verifiedCount}/{totalStations}
          </p>
        </div>

        {/* ── Summary + verifier ──────────────────────────────────────────── */}
        <div style={{ marginBottom: "28px" }}>
          <p
            style={{
              fontSize: "22px",
              color: "#1A1A1A",
              margin: "0 0 6px 0",
              lineHeight: "1.4",
              textAlign: "center",
            }}
          >
            {verifiedCount === totalStations
              ? `${displayName} is calibrated on all ${totalStations} clarity points.`
              : `${displayName} is calibrated on ${verifiedCount} of ${totalStations} clarity points.`}
          </p>
          <p
            style={{
              fontSize: "16px",
              color: "rgba(26, 26, 26, 0.65)",
              margin: 0,
              textAlign: "center",
            }}
          >
            Verified by {certifierName}.
          </p>
        </div>

        {/* ── Point list: 3-column grid, 9 cells ──────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "10px 16px",
            marginBottom: "28px",
            flex: 1,
          }}
        >
          {badgePointsReference.map((station) => {
            const earned = isEarned(station, badgePoints);
            return (
              <div
                key={station.stationTag}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 12px",
                  backgroundColor: earned
                    ? "rgba(0, 43, 92, 0.06)"
                    : "rgba(26, 26, 26, 0.03)",
                  borderRadius: "6px",
                  border: earned ? "1px solid rgba(0, 43, 92, 0.2)" : "1px solid rgba(26, 26, 26, 0.08)",
                }}
              >
                {/* Check / circle indicator */}
                <span
                  style={{
                    fontSize: "16px",
                    lineHeight: "1.4",
                    flexShrink: 0,
                    color: earned ? "#002B5C" : "rgba(26, 26, 26, 0.3)",
                    fontWeight: earned ? "700" : "400",
                  }}
                >
                  {earned ? "✓" : "○"}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.4",
                    color: earned ? "#1A1A1A" : "rgba(26, 26, 26, 0.4)",
                    wordBreak: "break-word",
                    hyphens: "auto",
                  }}
                >
                  {truncate(station.title, 72)}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Signature footer ─────────────────────────────────────────────── */}
        <div
          style={{
            paddingTop: "20px",
            borderTop: "3px solid #002B5C",
          }}
        >
          {/* Row: Name (left) | Seal (center) | QR (right) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            {/* Left: Name + optional role */}
            <div style={{ flex: 1 }}>
              <h3
                style={{
                  fontSize: "22px",
                  fontWeight: "600",
                  color: "#1A1A1A",
                  margin: "0 0 4px 0",
                }}
              >
                {displayName}
              </h3>
              {profile.role && (
                <p
                  style={{
                    fontSize: "15px",
                    color: "rgba(26, 26, 26, 0.65)",
                    margin: 0,
                  }}
                >
                  {profile.role.length > 50 ? profile.role.slice(0, 47) + "..." : profile.role}
                </p>
              )}
            </div>

            {/* Center: Seal */}
            <div
              style={{
                width: "120px",
                display: "flex",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <SealSvg />
            </div>

            {/* Right: QR code */}
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  backgroundColor: "white",
                  padding: "10px",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                }}
              >
                <QRCodeSVG value={qrUrl} size={120} level="M" />
              </div>
            </div>
          </div>

          {/* Watermark */}
          <div
            style={{
              textAlign: "center",
              paddingTop: "12px",
              borderTop: "1px solid rgba(26, 26, 26, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {/* Inline logo mark — same as export-certificate.tsx */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 128 128"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="64" cy="64" r="64" fill="#3b82f6" />
              <path
                d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
                stroke="white"
                strokeWidth="14"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(26, 26, 26, 0.5)",
                letterSpacing: "0.1em",
                margin: 0,
              }}
            >
              claritypledge.com
            </p>
          </div>
        </div>
      </div>
    );
  }
);

ExportBadgeCertificate.displayName = "ExportBadgeCertificate";
