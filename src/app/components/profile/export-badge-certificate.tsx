import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BadgeCertificateProps } from "./badge-certificate";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

function positionLabel(position: string): string {
  return position === "strongly_agree" ? "Strongly Agrees ✓" : "Agrees ✓";
}

// ── Inline SVG seal ───────────────────────────────────────────────────────────
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
 * All earned items shown expanded (no toggle state in static image).
 */
export const ExportBadgeCertificate = forwardRef<HTMLDivElement, BadgeCertificateProps>(
  (
    {
      profile,
      badgePoints,
      certifierName,
      badgeUrl,
    },
    ref
  ) => {
    const verifiedCount = badgePoints.length;
    const totalStations = 9;

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
            marginBottom: "24px",
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
            Verified recursive understanding
          </p>
        </div>

        {/* ── Progress bar ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
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

        {/* ── Summary ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "20px", textAlign: "center" }}>
          <p style={{ fontSize: "20px", color: "#1A1A1A", margin: "0 0 4px 0", lineHeight: "1.4" }}>
            {verifiedCount === totalStations
              ? `${displayName} is calibrated on all ${totalStations} clarity points.`
              : `${displayName} is calibrated on ${verifiedCount} of ${totalStations} clarity points.`}
          </p>
          <p style={{ fontSize: "14px", color: "rgba(26, 26, 26, 0.65)", margin: 0 }}>
            Verified by {certifierName}.
          </p>
        </div>

        {/* ── Earned point list — all expanded ─────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "20px",
          }}
        >
          {badgePoints.map(bp => (
            <div
              key={bp.id}
              style={{
                padding: "10px 14px",
                backgroundColor: "rgba(0, 43, 92, 0.04)",
                border: "1px solid rgba(0, 43, 92, 0.15)",
                borderRadius: "6px",
              }}
            >
              {/* Story excerpt */}
              {bp.storyContent && (
                <p
                  style={{
                    fontSize: "11px",
                    color: "rgba(26, 26, 26, 0.6)",
                    fontStyle: "italic",
                    margin: "0 0 5px 0",
                    lineHeight: "1.4",
                  }}
                >
                  "{truncate(bp.storyContent.trim(), 90)}"
                </p>
              )}

              {/* Position row */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#1A1A1A" }}>
                  {displayName}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(0, 43, 92, 0.1)",
                    color: "#002B5C",
                  }}
                >
                  {positionLabel(bp.position)}
                </span>
              </div>

              {/* Point statement */}
              <p
                style={{
                  fontSize: "12px",
                  color: "#1A1A1A",
                  margin: 0,
                  lineHeight: "1.4",
                  wordBreak: "break-word",
                }}
              >
                {truncate(bp.pointStatement, 120)}
              </p>
            </div>
          ))}
        </div>

        {/* ── Signature footer ─────────────────────────────────────────────── */}
        <div style={{ paddingTop: "16px", borderTop: "3px solid #002B5C" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: "22px", fontWeight: "600", color: "#1A1A1A", margin: "0 0 4px 0" }}>
                {displayName}
              </h3>
              {profile.role && (
                <p style={{ fontSize: "14px", color: "rgba(26, 26, 26, 0.65)", margin: 0 }}>
                  {profile.role.length > 50 ? profile.role.slice(0, 47) + "..." : profile.role}
                </p>
              )}
            </div>
            <div style={{ width: "120px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <SealSvg />
            </div>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  backgroundColor: "white",
                  padding: "10px",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                }}
              >
                <QRCodeSVG value={qrUrl} size={100} level="M" />
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              paddingTop: "10px",
              borderTop: "1px solid rgba(26, 26, 26, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="64" cy="64" r="64" fill="#3b82f6" />
              <path
                d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
                stroke="white"
                strokeWidth="14"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <p style={{ fontSize: "12px", color: "rgba(26, 26, 26, 0.5)", letterSpacing: "0.1em", margin: 0 }}>
              claritypledge.com
            </p>
          </div>
        </div>
      </div>
    );
  }
);

ExportBadgeCertificate.displayName = "ExportBadgeCertificate";
