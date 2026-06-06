/**
 * @file doc-block-controls.tsx
 * @description P551: Overlay controls for doc blocks — drag handle, remove (story),
 * and hide/show toggle (point). Desktop: appear on hover. Mobile: always visible.
 */

import { GripVertical, X, Eye, EyeOff, ChevronUp, ChevronDown, ArrowUpToLine } from 'lucide-react';
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

interface PointControlsProps {
  variant: 'point';
  isHidden: boolean;
  onToggleHidden: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  /** P898: pre/post-story split toggle. Rendered only when showLeadToggle is true. */
  showLeadToggle?: boolean;
  isLead?: boolean;
  onToggleLead?: () => void;
}

type DocBlockControlsProps = StoryControlsProps | PointControlsProps;

export function DocBlockControls(props: DocBlockControlsProps) {
  const { variant } = props;

  return (
    <div
      className={cn(
        'flex items-center gap-1 h-8 ml-1',
        'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150'
      )}
    >
      {variant === 'story' ? (
        <>
          {/* Drag handle — story reorder via dnd-kit */}
          <Button
            variant="ghost"
            size="icon"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-grab"
            aria-label="Drag to reorder"
            aria-roledescription="draggable"
            {...props.dragAttributes}
            {...(props.dragListeners as React.HTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Remove from this doc"
            onClick={(e) => { e.stopPropagation(); props.onRemove(); }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </>
      ) : (
        <>
          {/* Up/down arrows — point reorder (compact) */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label="Move up"
            disabled={props.isFirst}
            onClick={(e) => { e.stopPropagation(); props.onMoveUp?.(); }}
          >
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label="Move down"
            disabled={props.isLast}
            onClick={(e) => { e.stopPropagation(); props.onMoveDown?.(); }}
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {/* Eye toggle — hide/show for letter composition (compact) */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-pressed={props.isHidden}
            aria-label={props.isHidden ? 'Show in letter' : 'Hide in letter'}
            onClick={(e) => { e.stopPropagation(); props.onToggleHidden(); }}
          >
            {props.isHidden ? (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          {/* P898: Lead toggle — marks the point to render before the story.
              Sibling of the eye toggle; shown only when 2+ visible points exist. */}
          {props.showLeadToggle && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              aria-pressed={props.isLead}
              aria-label={props.isLead ? 'Move after the story' : 'Show before the story'}
              onClick={(e) => { e.stopPropagation(); props.onToggleLead?.(); }}
            >
              <ArrowUpToLine
                className={cn('h-3.5 w-3.5', props.isLead ? 'text-blue-600' : 'text-muted-foreground')}
              />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
