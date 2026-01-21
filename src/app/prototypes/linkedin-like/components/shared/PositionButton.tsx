import { Position } from '../../data/mock-data';
import { Button } from '@/components/ui/button';
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
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
    icon: '✓',
  },
  disagree: {
    label: 'Disagree',
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
    icon: '✗',
  },
  dont_know: {
    label: 'Unsure',
    activeClass: 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600',
    inactiveClass: 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300',
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
        <Button
          onClick={onClick}
          variant="outline"
          size="sm"
          className={`rounded-full ${active ? c.activeClass : c.inactiveClass}`}
        >
          <span>{c.label}</span>
          <span className={active ? 'opacity-90' : 'opacity-60'}>{count}</span>
        </Button>
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
