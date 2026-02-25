/**
 * @file ContextChip.tsx
 * @description Sticky position-context chip showing the point a story is linked to.
 * Stateless display component — no service calls.
 */

import { useState } from 'react';
import { Pin } from 'lucide-react';

export interface ContextChipProps {
  pointText: string;
  pointId: string;
  userPosition?: string | null;
}

const TRUNCATE_LENGTH = 80;

export function ContextChip({ pointText, pointId: _pointId, userPosition }: ContextChipProps) {
  const [expanded, setExpanded] = useState(false);

  const isTruncatable = pointText.length > TRUNCATE_LENGTH;
  const displayText =
    !expanded && isTruncatable ? `${pointText.slice(0, TRUNCATE_LENGTH)}…` : pointText;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setExpanded((prev) => !prev);
    }
  }

  return (
    <div
      role="region"
      aria-label="Point context"
      data-testid="context-chip"
      className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm"
    >
      <div className="flex items-start gap-1.5">
        <Pin size={12} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <span className="text-blue-900 dark:text-blue-100">{displayText}</span>
      </div>

      {isTruncatable && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-label={expanded ? 'Collapse point text' : 'Expand full point text'}
          className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {userPosition && (
        <span className="mt-1.5 inline-block bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs rounded px-1.5 py-0.5">
          {userPosition}
        </span>
      )}
    </div>
  );
}
