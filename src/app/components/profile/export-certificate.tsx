import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PLEDGE_TEXT, YourRightText, MyPromiseText, ExceptionText } from "@/app/content/pledge-text";

interface ExportCertificateProps {
  name: string;
  role?: string;
  signedAt: string;
  slug: string;
  acceptanceCount: number;
  avatarColor?: string;
  /** @deprecated No longer used - all users are verified. Kept for API compatibility. */
  isVerified?: boolean;
}

/**
 * Fixed-size certificate component for PNG export.
 * Renders at 1080x1080 pixels with inline styles for html-to-image compatibility.
 */
export const ExportCertificate = forwardRef<HTMLDivElement, ExportCertificateProps>(
  ({ name, role, signedAt, slug, acceptanceCount, avatarColor }, ref) => {
    // Use production domain for QR code (export is for sharing externally)
    const profileUrl = `https://claritypledge.com/p/${slug}`;

    // Truncate long names/roles
    const displayName = name.length > 30 ? name.slice(0, 27) + "..." : name;
    const displayRole = role && role.length > 40 ? role.slice(0, 37) + "..." : role;

    return (
      <div
        ref={ref}
        style={{
          width: "1080px",
          height: "1080px",
          padding: "60px",
          backgroundColor: "#FDFBF7",
          border: "16px solid #002B5C",
          outline: "4px solid #002B5C",
          outlineOffset: "-24px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Title */}
        <div
          style={{
            textAlign: "center",
            paddingBottom: "20px",
            borderBottom: "3px solid #002B5C",
            marginBottom: "30px",
          }}
        >
          <h2
            style={{
              fontSize: "48px",
              fontWeight: "400",
              letterSpacing: "0.05em",
              color: "#1A1A1A",
              margin: "0 0 10px 0",
              fontFamily: "Georgia, serif",
            }}
          >
            {PLEDGE_TEXT.title}
          </h2>
          <p
            style={{
              fontSize: "14px",
              color: "rgba(26, 26, 26, 0.6)",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              margin: 0,
            }}
          >
            {PLEDGE_TEXT.subtitle}
          </p>
        </div>

        {/* Commitment Statement */}
        <div
          style={{
            fontSize: "24px",
            lineHeight: "1.6",
            color: "#1A1A1A",
            fontFamily: "Georgia, serif",
            marginBottom: "20px",
          }}
        >
          I, <span style={{ fontWeight: "bold" }}>{displayName}</span>, hereby commit to{" "}
          <span style={{ fontWeight: "600" }}>everyone</span>
          —including strangers, people I disagree with, and even those I dislike:
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: "1px solid rgba(26, 26, 26, 0.2)",
            marginBottom: "20px",
          }}
        />

        {/* Your Right Section */}
        <div style={{ marginBottom: "20px" }}>
          <h4
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              color: "#0044CC",
              letterSpacing: "0.05em",
              margin: "0 0 15px 0",
            }}
          >
            {PLEDGE_TEXT.yourRight.heading}
          </h4>
          <p
            style={{
              fontSize: "20px",
              lineHeight: "1.6",
              color: "#1A1A1A",
              margin: 0,
            }}
          >
            <YourRightText />
          </p>
        </div>

        {/* My Promise Section */}
        <div style={{ marginBottom: "20px" }}>
          <h4
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              color: "#0044CC",
              letterSpacing: "0.05em",
              margin: "0 0 15px 0",
            }}
          >
            {PLEDGE_TEXT.myPromise.heading}
          </h4>
          <p
            style={{
              fontSize: "20px",
              lineHeight: "1.6",
              color: "#1A1A1A",
              margin: 0,
            }}
          >
            <MyPromiseText />
          </p>
        </div>

        {/* The Exception Section */}
        <div style={{ marginBottom: "25px" }}>
          <h4
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              color: "#0044CC",
              letterSpacing: "0.05em",
              margin: "0 0 15px 0",
            }}
          >
            {PLEDGE_TEXT.exception.heading}
          </h4>
          <p
            style={{
              fontSize: "20px",
              lineHeight: "1.6",
              color: "#1A1A1A",
              margin: 0,
            }}
          >
            <ExceptionText />
          </p>
        </div>

        {/* Spacer to push bottom content down */}
        <div style={{ flex: 1 }} />

        {/* Bottom Section */}
        <div
          style={{
            paddingTop: "20px",
            borderTop: "3px solid #002B5C",
          }}
        >
          {/* Signature row: Avatar+Name | Seal | QR Code */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            {/* Left: Avatar + Name + Date */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
              {/* Avatar circle - uses user's avatar color if available */}
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: avatarColor || "#1A1A1A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "28px",
                  fontWeight: "600",
                  flexShrink: 0,
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
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
                {displayRole && (
                  <p
                    style={{
                      fontSize: "16px",
                      color: "rgba(26, 26, 26, 0.7)",
                      margin: "0 0 4px 0",
                    }}
                  >
                    {displayRole}
                  </p>
                )}
                {/* Date signed - removed "Verified" badge as all users are verified */}
                <span
                  style={{
                    fontSize: "14px",
                    color: "rgba(26, 26, 26, 0.5)",
                  }}
                >
                  Signed {new Date(signedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Center: Seal - Logo mark as official stamp */}
            <div
              style={{
                width: "120px",
                display: "flex",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
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
                {/* Logo mark as seal */}
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 128 128"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="128" height="128" rx="24" fill="#1A1A1A" />
                  <path
                    d="M40 32 L40 72 C40 88 50 96 64 96 C78 96 88 88 88 72 L88 32"
                    stroke="#FDFBF7"
                    strokeWidth="14"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </div>
            </div>

            {/* Right: QR Code (larger) */}
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  backgroundColor: "white",
                  padding: "10px",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                }}
              >
                <QRCodeSVG value={profileUrl} size={180} level="M" />
              </div>
            </div>
          </div>

          {/* Acceptance count and watermark */}
          <div
            style={{
              textAlign: "center",
              paddingTop: "12px",
              borderTop: "1px solid rgba(26, 26, 26, 0.1)",
            }}
          >
            {acceptanceCount > 0 && (
              <p
                style={{
                  fontSize: "18px",
                  color: "#0044CC",
                  fontWeight: "500",
                  margin: "0 0 10px 0",
                }}
              >
                {acceptanceCount === 1
                  ? `1 person accepted ${name.split(" ")[0]}'s pledge`
                  : `${acceptanceCount} people accepted ${name.split(" ")[0]}'s pledge`}
              </p>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {/* Inline logo mark for html-to-image compatibility */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 128 128"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="128" height="128" rx="24" fill="#1A1A1A" />
                <path
                  d="M40 32 L40 72 C40 88 50 96 64 96 C78 96 88 88 88 72 L88 32"
                  stroke="#FDFBF7"
                  strokeWidth="14"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <p
                style={{
                  fontSize: "14px",
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
      </div>
    );
  }
);

ExportCertificate.displayName = "ExportCertificate";
