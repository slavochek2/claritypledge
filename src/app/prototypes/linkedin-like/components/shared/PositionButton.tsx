import { Position, currentUser } from '../../data/mock-data';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PositionButtonProps {
  position: Position;
  active: boolean;
  onClick: () => void;
  count: number;
}

const config = {
  agree: {
    label: 'Agree',
    activeClass: 'bg-emerald-500 text-white border-emerald-500',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
    icon: '✓',
  },
  disagree: {
    label: 'Disagree',
    activeClass: 'bg-rose-500 text-white border-rose-500',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
    icon: '✗',
  },
  dont_know: {
    label: 'Unsure',
    activeClass: 'bg-gray-500 text-white border-gray-500',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
    icon: '?',
  },
};

export function PositionButton({
  position,
  active,
  onClick,
  count,
}: PositionButtonProps) {
  const c = config[position as keyof typeof config];
  if (!c) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active ? c.activeClass : c.inactiveClass
          }`}
        >
          <span>{c.label}</span>
          <span className={active ? 'opacity-90' : 'opacity-60'}>{count}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{active ? `You ${c.label.toLowerCase()}d` : c.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// All position buttons always visible, active one highlighted
interface PositionButtonsProps {
  userPosition: Position;
  counts: { agree: number; disagree: number; dont_know: number };
  onPositionClick: (position: Position) => void;
}

export function PositionButtons({ userPosition, counts, onPositionClick }: PositionButtonsProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center justify-start gap-2">
        <PositionButton
          position="agree"
          active={userPosition === 'agree'}
          onClick={() => onPositionClick('agree')}
          count={counts.agree}
        />
        <PositionButton
          position="disagree"
          active={userPosition === 'disagree'}
          onClick={() => onPositionClick('disagree')}
          count={counts.disagree}
        />
        <PositionButton
          position="dont_know"
          active={userPosition === 'dont_know'}
          onClick={() => onPositionClick('dont_know')}
          count={counts.dont_know}
        />
      </div>
    </TooltipProvider>
  );
}
