import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PLEDGE_TEXT, YourRightText, MyPromiseText } from "@/app/content/pledge-text";

interface ExportCertificateProps {
  name: string;
  role?: string;
  signedAt: string;
  isVerified: boolean;
  slug: string;
  acceptanceCount: number;
}

/**
 * Fixed-size certificate component for PNG export.
 * Renders at 1080x1080 pixels with inline styles for html-to-image compatibility.
 */
export const ExportCertificate = forwardRef<HTMLDivElement, ExportCertificateProps>(
  ({ name, role, signedAt, isVerified, slug, acceptanceCount }, ref) => {
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
              {/* Avatar circle */}
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "#0044CC",
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
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {isVerified && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "#0044CC",
                        fontSize: "14px",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span style={{ fontWeight: "500" }}>Verified</span>
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: "14px",
                      color: "rgba(26, 26, 26, 0.5)",
                    }}
                  >
                    {new Date(signedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Center: Seal - fixed width container for centering */}
            <div
              style={{
                width: "120px",
                display: "flex",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isVerified ? (
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    border: "5px solid #0044CC",
                    backgroundColor: "#FDFBF7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(0, 68, 204, 0.3)",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "#0044CC",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      fill="none"
                      stroke="white"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    border: "2px dashed rgba(26, 26, 26, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(26, 26, 26, 0.05)",
                    }}
                  />
                </div>
              )}
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
                  ? "1 person accepted my pledge"
                  : `${acceptanceCount} people accepted my pledge`}
              </p>
            )}
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
    );
  }
);

ExportCertificate.displayName = "ExportCertificate";
