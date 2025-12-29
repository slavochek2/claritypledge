import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { QRCodeSVG } from "qrcode.react";
import {
  PLEDGE_VERSIONS,
  YourRightTextTailwind,
  MyPromiseTextTailwind,
  ExceptionTextTailwind,
  type PledgeVersion,
} from "@/app/content/pledge-text";
import { ClarityLogoMark } from "@/components/ui/clarity-logo";

interface ProfileCertificateProps {
  name: string;
  email?: string;
  signedAt: string;
  isVerified?: boolean;
  role?: string;
  linkedinUrl?: string;
  /** User's avatar color */
  avatarColor?: string;
  /** Direct photo URL for avatar */
  photoUrl?: string;
  /** Show QR code in certificate (for export) */
  showQrCode?: boolean;
  /** Profile URL for QR code */
  profileUrl?: string;
  /** Number of people who accepted the pledge */
  acceptanceCount?: number;
  /** Export mode: shows acceptance count and watermark at bottom */
  exportMode?: boolean;
  /** Pledge version: 1 = v1, 2 = v2 ("without"), 3 = v3 ("withholding") */
  pledgeVersion?: PledgeVersion;
}

export function ProfileCertificate({
  name,
  email,
  signedAt,
  role,
  linkedinUrl,
  avatarColor = "#0044CC",
  photoUrl,
  showQrCode = false,
  profileUrl,
  acceptanceCount = 0,
  exportMode = false,
  pledgeVersion = 2,
}: ProfileCertificateProps) {
  // Get the pledge content for this version
  const pledgeContent = PLEDGE_VERSIONS[pledgeVersion];
  // v2 and v3 share the same structure (header, exception sections)
  const hasExtendedFormat = pledgeVersion === 2 || pledgeVersion === 3;

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
        {/* Title */}
        <div className="text-center space-y-2 pb-6 border-b-2 border-[#002B5C] dark:border-border">
          <h2
            className="text-3xl md:text-4xl font-serif tracking-wide text-[#1A1A1A] dark:text-foreground"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            {pledgeContent.title}
          </h2>
          <p className="text-xs text-[#1A1A1A]/60 dark:text-muted-foreground uppercase tracking-[0.2em] font-sans">
            {pledgeContent.subtitle}
          </p>
          {/* V2: Show header tagline */}
          {hasExtendedFormat && 'header' in pledgeContent && (
            <p className="text-sm text-[#1A1A1A]/80 dark:text-muted-foreground italic mt-2">
              {pledgeContent.header}
            </p>
          )}
        </div>

        {/* Commitment Statement */}
        <div
          className="text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground font-serif"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          I, <span className="font-bold">{name}</span>, hereby commit to{" "}
          <span className="font-semibold">everyone</span>
          —including strangers, people I disagree with, and even those I
          dislike:
        </div>

        {/* Divider */}
        <div className="border-t border-[#1A1A1A]/20 dark:border-border/20" />

        {/* Your Right Section */}
        <div className="space-y-4">
          <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] dark:text-blue-400 tracking-wide">
            {pledgeContent.yourRight.heading}
          </h4>
          <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
            <YourRightTextTailwind version={pledgeVersion} />
          </p>
        </div>

        {/* My Promise Section */}
        <div className="space-y-4">
          <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] dark:text-blue-400 tracking-wide">
            {pledgeContent.myPromise.heading}
          </h4>
          <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
            <MyPromiseTextTailwind version={pledgeVersion} />
          </p>
        </div>

        {/* V2+: The Exception Section */}
        {hasExtendedFormat && 'exception' in pledgeContent && (
          <div className="space-y-4">
            <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] dark:text-blue-400 tracking-wide">
              {pledgeContent.exception.heading}
            </h4>
            <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
              <ExceptionTextTailwind />
            </p>
          </div>
        )}

        {/* Bottom Section - Signature Layout */}
        <div className="pt-8 border-t-2 border-[#002B5C] dark:border-border">
          {/* Mobile: Stacked centered layout */}
          <div className="flex flex-col items-center gap-6 md:hidden">
            {/* Seal - Logo mark as official stamp */}
            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg">
              <ClarityLogoMark size={48} className="text-[#1A1A1A] dark:text-foreground" />
            </div>

            {/* Name and info - centered */}
            <div className="text-center">
              <h3 className="text-xl font-semibold text-[#1A1A1A] dark:text-foreground">
                {name}
              </h3>
              {role && (
                <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground mt-1">
                  {role}
                </p>
              )}
              {/* LinkedIn link - removed "Verified" badge as all users are verified */}
              <div className="flex items-center justify-center gap-3 mt-3">
                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#0A66C2] bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 rounded transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    LinkedIn
                  </a>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Date
              </p>
              <p className="text-base font-semibold text-[#1A1A1A] dark:text-foreground">
                {new Date(signedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            {/* QR Code - Mobile */}
            {showQrCode && profileUrl && (
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <QRCodeSVG
                  value={profileUrl}
                  size={100}
                  level="M"
                />
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Scan to view
                </p>
              </div>
            )}
          </div>

          {/* Desktop: Horizontal balanced layout */}
          <div className="hidden md:flex items-center gap-8">
            {/* Left: Avatar + Name */}
            <div className="flex-1 flex items-center gap-4">
              <GravatarAvatar
                email={email}
                name={name}
                size="md"
                avatarColor={avatarColor}
                photoUrl={photoUrl}
              />
              <div>
                <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-foreground leading-tight">
                  {name}
                </h3>
                {role && (
                  <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground mt-0.5">
                    {role}
                  </p>
                )}
                {/* LinkedIn link - removed "Verified" badge as all users are verified */}
                <div className="flex items-center gap-3 mt-1.5">
                  {linkedinUrl && (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#0A66C2] bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 rounded transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Seal - Logo mark as official stamp */}
            <div className="w-20 h-20 rounded-full border-4 border-[#1A1A1A] dark:border-foreground flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg flex-shrink-0">
              <ClarityLogoMark size={48} className="text-[#1A1A1A] dark:text-foreground" />
            </div>

            {/* Right: QR Code (export mode) or Date */}
            {showQrCode && profileUrl ? (
              <div className="flex-1 flex justify-end">
                <div className="bg-white p-2 rounded">
                  <QRCodeSVG
                    value={profileUrl}
                    size={80}
                    level="M"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Date
                </p>
                <p className="text-base font-semibold text-[#1A1A1A] dark:text-foreground">
                  {new Date(signedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Export mode: Acceptance count and watermark */}
        {exportMode && (
          <div className="mt-6 pt-4 border-t border-[#1A1A1A]/10 text-center space-y-2">
            {acceptanceCount > 0 && (
              <p className="text-sm text-[#0044CC] font-medium">
                {acceptanceCount === 1
                  ? `1 person accepted ${name.split(" ")[0]}'s pledge`
                  : `${acceptanceCount} people accepted ${name.split(" ")[0]}'s pledge`}
              </p>
            )}
            <p className="text-xs text-[#1A1A1A]/50 tracking-wide">
              claritypledge.com
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
