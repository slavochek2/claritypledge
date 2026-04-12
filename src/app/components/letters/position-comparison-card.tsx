import type { PositionType } from '@/app/types';
import { PositionBadge, getPositionVerb } from '@/app/components/shared/PositionBadge';

interface PositionComparisonCardProps {
  readerPosition: PositionType;
  authorPosition: PositionType;
  authorName: string;
  pointStatement: string;
}

export function PositionComparisonCard({
  readerPosition,
  authorPosition,
  authorName,
  pointStatement,
}: PositionComparisonCardProps) {
  const readerPositionVerb = getPositionVerb(readerPosition);
  const authorPositionVerb = getPositionVerb(authorPosition);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm border-l-4 border-l-blue-500">
      {/* Point statement header */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-sm text-gray-700">{pointStatement}</p>
      </div>

      {/* Two-column position comparison */}
      <div className="p-4">
        <div
          className="grid grid-cols-2 gap-4"
          aria-live="polite"
          aria-label={`Your position: ${readerPositionVerb}. ${authorName}'s position: ${authorPositionVerb}.`}
        >
          {/* Left column: reader */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">You</p>
            <PositionBadge position={readerPosition} />
          </div>

          {/* Right column: author */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">{authorName}</p>
            <PositionBadge position={authorPosition} />
          </div>
        </div>
      </div>
    </div>
  );
}
