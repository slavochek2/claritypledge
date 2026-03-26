/**
 * @file doc-block-controls.tsx
 * @description P551: Overlay controls for doc blocks — drag handle, remove (story),
 * and hide/show toggle (point). Desktop: appear on hover. Mobile: always visible.
 */

import { GripVertical, X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Props forwarded from parent useSortable (connected in Task 9) */
interface DragHandleProps {
  dragAttributes?: React.HTMLAttributes<HTMLButtonElement>;
  dragListeners?: Record<string, (...args: unknown[]) => void>;
}

interface StoryControlsProps extends DragHandleProps {
  variant: 'story';
  onRemove: () => void;
}

interface PointControlsProps extends DragHandleProps {
  variant: 'point';
  isHidden: boolean;
  onToggleHidden: () => void;
}

type DocBlockControlsProps = StoryControlsProps | PointControlsProps;

export function DocBlockControls(props: DocBlockControlsProps) {
  const { variant, dragAttributes, dragListeners } = props;

  return (
    <div
      className={cn(
        'flex items-center gap-1 h-8',
        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150'
      )}
    >
      {/* Drag handle */}
      <Button
        variant="ghost"
        size="icon"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-grab"
        aria-label="Drag to reorder"
        aria-roledescription="draggable"
        {...dragAttributes}
        {...(dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </Button>

      {/* Variant-specific action */}
      {variant === 'story' ? (
        <Button
          variant="ghost"
          size="icon"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Remove from this doc"
          onClick={props.onRemove}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-pressed={props.isHidden}
          aria-label={props.isHidden ? 'Show in this doc' : 'Hide in this doc'}
          onClick={props.onToggleHidden}
        >
          {props.isHidden ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
}
