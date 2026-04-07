/**
 * @file letter-point-card.tsx
 * @description P673: Thin wrapper for point display in letter reading flow.
 * Uses shared PositionButtons from /live and PositionBadge for sender reveal.
 * Matches /live point row styling (blue left border, rounded card).
 */

'use client';

import { useState } from 'react';
import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PositionButtons, PositionBadge } from '@/app/components/shared';
import type { PositionType, PointSummary } from '@/app/types';

interface LetterPointCardProps {
  point: PointSummary;
  senderName: string;
  /** Whether sender's position has been revealed (after receiver submits) */
  isRevealed: boolean;
  /** The receiver's submitted position for this point */
  receiverPosition: string | null;
  onSubmitPosition: (pointId: string, position: string) => void;
  disabled?: boolean;
}

export function LetterPointCard({
  point,
  senderName,
  isRevealed,
  receiverPosition,
  onSubmitPosition,
  disabled = false,
}: LetterPointCardProps) {
  const [selectedPosition, setSelectedPosition] = useState<PositionType | null>(null);

  const handlePositionClick = (position: PositionType) => {
    // Ignore null deselection — not supported in letters (Decision 6 security constraint)
    if (position === null) return;
    if (receiverPosition || disabled) return;
    setSelectedPosition(position);
  };

  const handleSubmit = () => {
    if (!selectedPosition) return;
    onSubmitPosition(point.id, selectedPosition);
  };

  return (
    <div className="rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm p-4 space-y-3">
      {/* Point text */}
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
          <Pin size={12} className="rotate-45" />
        </div>
        <p className="text-sm text-gray-800 flex-1 min-w-0 break-words">{point.statement}</p>
      </div>

      {/* Position buttons (hidden after reveal) */}
      {!isRevealed && (
        <>
          <PositionButtons
            userPosition={selectedPosition}
            counts={{}}
            onPositionClick={handlePositionClick}
            compact
            narrow
          />
          <Button
            onClick={handleSubmit}
            disabled={!selectedPosition || disabled}
            className="w-full bg-[#0044CC] hover:bg-[#0033AA] text-white min-h-[44px]"
          >
            Submit
          </Button>
        </>
      )}

      {/* Sender position reveal */}
      {isRevealed && point.profileSubjectPosition && (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <span className="font-medium">{senderName}:</span>
          <PositionBadge position={point.profileSubjectPosition} />
        </div>
      )}

      {/* Receiver's position reminder */}
      {isRevealed && receiverPosition && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>You:</span>
          <PositionBadge position={receiverPosition as PositionType} />
        </div>
      )}
    </div>
  );
}
