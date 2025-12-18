/**
 * @file partner-commitment-card.tsx
 * @description Displays the 10-minute commitment promise from one partner to another.
 * Used on the invitation screen when joiner sees creator's commitment.
 */

interface PartnerCommitmentCardProps {
  creatorName: string;
  commitmentText: string;
}

export function PartnerCommitmentCard({
  creatorName,
  commitmentText,
}: PartnerCommitmentCardProps) {
  return (
    <div className="bg-[#FDFBF7] dark:bg-card border-2 border-[#002B5C] rounded-lg p-6 md:p-8">
      <p className="text-lg leading-relaxed text-[#1A1A1A] dark:text-foreground">
        {commitmentText}
      </p>
      <p className="text-right mt-4 text-[#0044CC] font-medium">
        — {creatorName}
      </p>
    </div>
  );
}

/** The standard 10-minute commitment text */
export const PARTNER_COMMITMENT_TEXT = `For the next 10 minutes, I commit to genuinely trying to understand your perspective—not to agree with it, but to understand it as you mean it—before sharing my own.`;
