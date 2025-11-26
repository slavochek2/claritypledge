interface ProfileCertificateProps {
  name: string;
  date: string;
}

export function ProfileCertificate({ name, date }: ProfileCertificateProps) {
  return (
    <div className="bg-[#FDFBF7] border-2 border-[#1A1A1A] p-8 md:p-12 rounded-lg shadow-xl">
      {/* Decorative Header */}
      <div className="text-center mb-8 pb-6 border-b-2 border-[#1A1A1A]">
        <div className="inline-block">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#0044CC] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-sm uppercase tracking-widest text-[#1A1A1A] font-semibold">
            Certificate of Commitment
          </h3>
        </div>
      </div>

      {/* Main Pledge Text */}
      <div className="text-center space-y-6 mb-8">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif leading-tight text-[#1A1A1A]">
          The Clarity Pledge
        </h1>

        <div className="max-w-2xl mx-auto space-y-4 text-lg md:text-xl text-[#1A1A1A] leading-relaxed">
          <p className="font-semibold">
            I, <span className="border-b-2 border-[#0044CC] px-2">{name}</span>,
            hereby pledge:
          </p>

          <div className="text-left space-y-4 py-6">
            <p className="italic">
              "I grant you the right to verify your understanding of what I've
              said."
            </p>
            <p className="italic">
              "I promise not to judge you for asking clarifying questions."
            </p>
            <p className="italic">
              "I commit to creating a space where mutual understanding is valued
              over assumptions."
            </p>
          </div>

          <p className="text-base text-muted-foreground">
            By taking this pledge, I commit to eliminating the Clarity Tax in my
            interactions and building a foundation of verified mutual
            understanding.
          </p>
        </div>
      </div>

      {/* Signature Line */}
      <div className="flex items-center justify-between pt-6 border-t-2 border-[#1A1A1A]">
        <div className="text-left">
          <p className="text-sm uppercase tracking-wide text-muted-foreground mb-1">
            Signed by
          </p>
          <p className="text-xl font-semibold text-[#1A1A1A]">{name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-wide text-muted-foreground mb-1">
            Date
          </p>
          <p className="text-xl font-semibold text-[#1A1A1A]">
            {new Date(date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Seal */}
      <div className="mt-8 flex justify-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-[#0044CC] flex items-center justify-center border-4 border-[#1A1A1A]">
            <span className="text-white font-bold text-xs text-center leading-tight">
              CLARITY
              <br />
              PLEDGE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
