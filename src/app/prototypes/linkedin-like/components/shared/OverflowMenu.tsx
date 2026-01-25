import { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface OverflowMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
}

/**
 * Mobile overflow menu for card actions.
 * Uses Radix DropdownMenu for accessibility.
 * 44px touch targets on trigger and items.
 */
export function OverflowMenu({ items }: OverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="More actions"
        >
          <MoreHorizontal size={20} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {items.map((item, index) => (
          <DropdownMenuItem
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
            className="min-h-[44px] flex items-center gap-2 cursor-pointer"
          >
            <span className="text-gray-500">{item.icon}</span>
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
