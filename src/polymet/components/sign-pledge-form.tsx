import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BadgeCheckIcon, PenToolIcon } from "lucide-react";
import { usePledgeForm } from "@/hooks/use-pledge-form";

interface SignPledgeFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function SignPledgeForm({
  onSuccess,
  onSwitchToLogin,
}: SignPledgeFormProps) {
  const { 
    formState: {
      name,
      email,
      role,
      linkedinUrl,
      reason,
      isSubmitting,
      isSealing,
      error,
      nameError,
      isCheckingName
    },
    setters: {
      setName,
      setEmail,
      setRole,
      setLinkedinUrl,
      setReason
    },
    handleSubmit
  } = usePledgeForm(onSuccess);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
      {/* Double Border Frame - Matching Certificate */}
      <div
        className="rounded-lg p-4 md:p-12 bg-[#FDFBF7] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]"
        style={{
          border: "8px solid #002B5C",
          outline: "2px solid #002B5C",
          outlineOffset: "-12px",
        }}
      >
        {/* Document Header */}
        <div className="text-center space-y-1.5 md:space-y-2 pb-4 md:pb-6 border-b-2 border-[#002B5C]">
          <h2
            className="text-2xl md:text-4xl font-serif tracking-wide text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            The Clarity Pledge
          </h2>
          <p className="text-[10px] md:text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">
            A Public Promise
          </p>
        </div>

        {/* Pledge Text with Name Input */}
        <div className="space-y-4 md:space-y-6 py-4 md:py-6">
          <div className="text-base md:text-lg leading-relaxed text-[#1A1A1A]">
            <span
              className="font-serif"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              I,{" "}
            </span>
            <Input
              id="name"
              type="text"
              placeholder="[Your Full Name]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="inline-block w-auto min-w-[140px] md:min-w-[150px] mx-1 md:mx-2 px-2 md:px-3 py-0.5 md:py-1 border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-[#0044CC] font-serif text-base md:text-lg h-auto"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            />
            {isCheckingName && (
              <span className="text-sm text-gray-500 ml-2">Checking...</span>
            )}
            {nameError && (
              <span className="text-sm text-red-500 ml-2">{nameError}</span>
            )}

            <span
              className="font-serif"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              , hereby commit to <span className="font-semibold">everyone</span>
              —including strangers, people I disagree with, and even those I
              dislike:
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1A1A1A]/20 my-3 md:my-4" />

          {/* Your Right Section - Matching Certificate Design */}
          <div className="space-y-2 md:space-y-4">
            <h3 className="text-lg md:text-2xl font-bold text-[#0044CC] tracking-wide">
              YOUR RIGHT
            </h3>
            <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A]">
              When we talk, if you need to check whether I understood your idea
              in the way you meant it, please ask me to{" "}
              <span className="font-bold">explain back</span> to you how I
              understood it.
            </p>
          </div>

          {/* My Promise Section - Matching Certificate Design */}
          <div className="space-y-2 md:space-y-4">
            <h3 className="text-lg md:text-2xl font-bold text-[#0044CC] tracking-wide">
              MY PROMISE
            </h3>
            <p className="text-base md:text-lg leading-relaxed text-[#1A1A1A]">
              I promise to <span className="font-bold">try</span> to{" "}
              <span className="font-bold">explain back</span> what I think you
              meant
              <span className="font-bold">
                {" "}
                without judgment or criticism
              </span>{" "}
              so you can confirm or correct my understanding. If I cannot follow
              this promise, I will explain why.
            </p>
          </div>
        </div>

        {/* Verification Details Section */}
        <div className="space-y-3 md:space-y-4 pt-4 md:pt-6 border-t-2 border-[#002B5C]">
          <div className="space-y-1.5 md:space-y-2">
            <Label htmlFor="email" className="text-sm text-[#1A1A1A]/70">
              Signed with: Email
            </Label>
            <Input
              id="email"
              type="text"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-0 border-b-2 border-[#1A1A1A] rounded-none focus-visible:border-[#0044CC] focus-visible:ring-0 bg-transparent px-0"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-1 md:space-y-2">
              <Label htmlFor="role" className="text-sm text-[#1A1A1A]/70">
                Role <span className="text-[#1A1A1A]/50">(Optional)</span>
              </Label>
              <Input
                id="role"
                type="text"
                placeholder="e.g., Product Designer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="border-0 border-b-2 border-[#1A1A1A]/40 rounded-none focus-visible:border-[#1A1A1A] focus-visible:ring-0 bg-transparent px-0"
              />
            </div>

            <div className="space-y-1 md:space-y-2">
              <Label htmlFor="linkedin" className="text-sm text-[#1A1A1A]/70">
                LinkedIn{" "}
                <span className="text-[#1A1A1A]/50">(For verification)</span>
              </Label>
              <Input
                id="linkedin"
                type="text"
                placeholder="linkedin.com/in/yourname"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="border-0 border-b-2 border-[#1A1A1A]/40 rounded-none focus-visible:border-[#1A1A1A] focus-visible:ring-0 bg-transparent px-0"
              />
            </div>
          </div>

          <div className="space-y-1 md:space-y-2">
            <Label htmlFor="reason" className="text-sm text-[#1A1A1A]/70">
              Why are you taking this pledge?{" "}
              <span className="text-[#1A1A1A]/50">
                (Optional but encouraged)
              </span>
            </Label>
            <textarea
              id="reason"
              placeholder="Share what you hope to achieve, why this matters to you, or how you'll use this commitment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2} // Reduced default rows
              maxLength={280}
              className="w-full px-0 py-2 border-0 border-b-2 border-[#1A1A1A]/40 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:border-[#1A1A1A] resize-none text-sm md:h-auto"
            />

            <p className="text-[10px] md:text-xs text-[#1A1A1A]/50">
              {reason.length}/280 characters • Your reason will be public and
              help inspire others
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Sign & Seal Button */}
        <div className="space-y-2 md:space-y-3">
          <Button
            type="submit"
            className="w-full bg-[#002B5C] hover:bg-[#001f45] text-white font-semibold text-base md:text-lg py-4 md:py-6 relative overflow-hidden group"
            size="lg"
            disabled={isSubmitting || !!nameError || isCheckingName}
          >
            {isSealing ? (
              <span className="flex items-center justify-center gap-2">
                <BadgeCheckIcon className="w-5 h-5 animate-pulse" />
                Signing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <PenToolIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Sign the Pledge
              </span>
            )}
          </Button>

          {/* Helper Text */}
          <p className="text-[10px] md:text-xs text-center text-[#1A1A1A]/60 leading-relaxed">
            We will send a verification link to your email. Your pledge becomes
            public only after you click it.
          </p>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Already Pledged? Log In
          </button>
        </div>
      </div>
    </form>
  );
}
