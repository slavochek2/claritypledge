import { ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VerifyButtonProps {
  verificationCount: number;  // Total number of verifications
  onClick: (e: React.MouseEvent) => void;
  isOpen?: boolean;           // Whether the panel is expanded
}

export function VerifyButton({ verificationCount, onClick, isOpen = false }: VerifyButtonProps) {
  const hasVerifications = verificationCount > 0;

  // Determine visual styling based on state
  const getButtonStyle = () => {
    if (isOpen) {
      return 'text-blue-700 bg-blue-100';
    }
    if (hasVerifications) {
      return 'text-blue-600 bg-blue-50 hover:bg-blue-100';
    }
    return 'text-gray-500 hover:text-blue-600 hover:bg-blue-50';
  };

  const ChevronIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium transition-colors ${getButtonStyle()}`}
          >
            <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white font-bold">C</span>
            <span>{verificationCount}</span>
            <ChevronIcon size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{verificationCount} {verificationCount === 1 ? 'understanding' : 'understandings'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
