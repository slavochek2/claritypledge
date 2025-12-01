import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { RefreshCwIcon } from "lucide-react";

interface RecipocationCardProps {
  referrerId: string;
}

export function RecipocationCard({ referrerId }: RecipocationCardProps) {
  return (
    <div className="border-2 border-[#1A1A1A] dark:border-border rounded-lg p-8 bg-gradient-to-br from-[#FDFBF7] to-[#FFF9E6] dark:from-card dark:to-card">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <RefreshCwIcon className="w-6 h-6 text-[#0044CC] dark:text-blue-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-foreground">
              Clarity works best when it's mutual
            </h3>
            <p className="text-sm text-muted-foreground">
              Sign your own pledge and invite others to accept your commitment
              to verified understanding
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Link to={`/?referrer=${referrerId}`} className="block">
            <Button
              className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white"
              size="lg"
            >
              Take My Own Pledge
            </Button>
          </Link>
          <p className="text-xs text-center text-muted-foreground">
            Less than 30 seconds
          </p>
        </div>
      </div>
    </div>
  );
}
