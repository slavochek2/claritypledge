/**
 * @file VerificationStatusDialog.tsx
 * @description Read-only dialog showing verification status for an idea.
 * Simple view: person1 ← → person2 with arrows showing verification direction.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VerificationSession, getUserById, currentUser } from '../../data/mock-data';

interface VerificationStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: VerificationSession[];
}

// Get arrow based on verification state between two people
const getArrowForSession = (session: VerificationSession): { symbol: string; color: string } => {
  const [p1, p2] = session.participants;
  const verifiedBy = session.verifiedBy || [];
  const p1Verified = verifiedBy.includes(p1);
  const p2Verified = verifiedBy.includes(p2);

  if (p1Verified && p2Verified) {
    return { symbol: '⇄', color: 'text-emerald-600' }; // mutual
  } else if (p1Verified && !p2Verified) {
    return { symbol: '→', color: 'text-blue-600' }; // p1 verified p2
  } else if (!p1Verified && p2Verified) {
    return { symbol: '←', color: 'text-blue-600' }; // p2 verified p1
  }
  return { symbol: '·', color: 'text-gray-400' }; // in progress
};

export function VerificationStatusDialog({
  open,
  onOpenChange,
  sessions,
}: VerificationStatusDialogProps) {
  // Always use actual name in relationship views (third-person narrative context)
  const getName = (userId: string) => {
    if (userId === 'current') return currentUser.name;
    const user = getUserById(userId);
    return user?.name || userId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-lg">Understanding Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          {/* Verification relationships - just arrows with names */}
          {sessions.map((session) => {
            const [p1, p2] = session.participants;
            const arrow = getArrowForSession(session);
            const verifiedBy = session.verifiedBy || [];
            const isMutual = verifiedBy.includes(p1) && verifiedBy.includes(p2);

            return (
              <div
                key={session.id}
                className={`flex items-center justify-center gap-3 py-2 px-3 rounded-lg ${
                  isMutual ? 'bg-emerald-50' : 'bg-gray-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-900">{getName(p1)}</span>
                <span className={`text-xl ${arrow.color}`}>{arrow.symbol}</span>
                <span className="text-sm font-medium text-gray-900">{getName(p2)}</span>
              </div>
            );
          })}

          {/* Empty state */}
          {sessions.length === 0 && (
            <div className="text-center py-4 text-gray-400 text-sm">
              No verifications yet
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
