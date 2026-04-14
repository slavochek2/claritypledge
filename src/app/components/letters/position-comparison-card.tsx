import { Pin } from 'lucide-react';
import type { PositionType } from '@/app/types';
import { PositionBadge } from '@/app/components/shared/PositionBadge';

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
  return (
    <div
      className="w-full text-left"
      aria-live="polite"
      aria-label={`Your position and ${authorName}'s position on: ${pointStatement}`}
    >
      {/* Position badge rows — receiver above, author below */}
      <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
        <span className="font-medium">You</span>
        <PositionBadge position={readerPosition} />
      </div>
      <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
        <span className="font-medium">{authorName}</span>
        <PositionBadge position={authorPosition} />
      </div>

      {/* Point statement — gray card with Pin icon, matches PointRow */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
            <Pin size={12} className="rotate-45" />
          </div>
          <p className="text-sm text-gray-800 flex-1 min-w-0 break-words">
            {pointStatement}
          </p>
        </div>
      </div>
    </div>
  );
}
