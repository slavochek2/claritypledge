interface ProfileCertificateProps {
  name: string;
  signedAt: string;
  isVerified?: boolean;
  role?: string;
  linkedinUrl?: string;
}

export function ProfileCertificate({
  name,
  signedAt,
  isVerified = false,
  role,
  linkedinUrl,
}: ProfileCertificateProps) {
  // Generate initials from name
  const getInitials = (fullName: string) => {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

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
            The Clarity Pledge
          </h2>
          <p className="text-xs text-[#1A1A1A]/60 dark:text-muted-foreground uppercase tracking-[0.2em] font-sans">
            A Public Promise
          </p>
        </div>

        {/* Commitment Statement */}
        <div
          className="text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground font-serif"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          I,{" "}
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-[#0044CC] dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1"
            >
              {name}
              <svg
                className="w-4 h-4 inline-block"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          ) : (
            <span className="font-bold">{name}</span>
          )}
          , hereby commit to <span className="font-semibold">everyone</span>
          —including strangers, people I disagree with, and even those I
          dislike:
        </div>

        {/* Divider */}
        <div className="border-t border-[#1A1A1A]/20 dark:border-border/20" />

        {/* Your Right Section */}
        <div className="space-y-4">
          <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] dark:text-blue-400 tracking-wide">
            YOUR RIGHT
          </h4>
          <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
            When we talk, if you need to check whether I understood your idea in
            the way you meant it, please ask me to{" "}
            <span className="font-bold">explain back</span> to you how I
            understood it.
          </p>
        </div>

        {/* My Promise Section */}
        <div className="space-y-4">
          <h4 className="text-xl md:text-2xl font-bold text-[#0044CC] dark:text-blue-400 tracking-wide">
            MY PROMISE
          </h4>
          <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
            I promise to <span className="font-bold">try</span> to{" "}
            <span className="font-bold">explain back</span> what I think you
            meant
            <span className="font-bold"> without judgment or criticism</span> so
            you can confirm or correct my understanding. If I cannot follow this
            promise, I will explain why.
          </p>
        </div>

        {/* Bottom Section - Signature Layout */}
        <div className="pt-6 border-t-2 border-[#002B5C] dark:border-border grid grid-cols-3 gap-4 items-end">
          {/* Bottom Left: Name, Title, Avatar */}
          <div className="flex items-center gap-3">
            {/* Avatar with Initials */}
            <div className="w-14 h-14 rounded-full bg-[#0044CC] dark:bg-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {getInitials(name)}
            </div>
            <div>
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 group"
                >
                  <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-foreground leading-tight group-hover:text-[#0044CC] dark:group-hover:text-blue-400 transition-colors">
                    {name}
                  </h3>
                  <svg
                    className="w-4 h-4 text-[#0044CC] dark:text-blue-400 opacity-70 group-hover:opacity-100 transition-opacity"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              ) : (
                <h3 className="text-base font-semibold text-[#1A1A1A] dark:text-foreground leading-tight">
                  {name}
                </h3>
              )}
              {role && (
                <p className="text-sm text-[#1A1A1A]/70 dark:text-muted-foreground mt-0.5">
                  {role}
                </p>
              )}
              {isVerified && (
                <div className="flex items-center gap-1 text-xs text-[#0044CC] dark:text-blue-400 mt-1">
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">Verified</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Center: Official Seal */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Outer decorative ring with notches (wax seal effect) */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, #0044CC 0deg 18deg, transparent 18deg 36deg, #0044CC 36deg 54deg, transparent 54deg 72deg, #0044CC 72deg 90deg, transparent 90deg 108deg, #0044CC 108deg 126deg, transparent 126deg 144deg, #0044CC 144deg 162deg, transparent 162deg 180deg, #0044CC 180deg 198deg, transparent 198deg 216deg, #0044CC 216deg 234deg, transparent 234deg 252deg, #0044CC 252deg 270deg, transparent 270deg 288deg, #0044CC 288deg 306deg, transparent 306deg 324deg, #0044CC 324deg 342deg, transparent 342deg 360deg)",
                  width: "80px",
                  height: "80px",
                  transform: "translate(-50%, -50%)",
                  top: "50%",
                  left: "50%",
                }}
              />

              {/* Double ring border */}
              <div
                className="relative w-20 h-20 rounded-full border-[5px] border-[#0044CC] dark:border-blue-500 flex items-center justify-center bg-[#FDFBF7] dark:bg-card shadow-lg"
                style={{
                  boxShadow:
                    "inset 0 0 0 2px #FDFBF7, inset 0 0 0 4px #0044CC, 0 4px 12px rgba(0, 68, 204, 0.3)",
                }}
              >
                <div className="w-12 h-12 rounded-full bg-[#0044CC] dark:bg-blue-500 flex items-center justify-center shadow-inner">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
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
            </div>
          </div>

          {/* Bottom Right: Date */}
          <div className="text-right">
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
        </div>
      </div>
    </div>
  );
}
