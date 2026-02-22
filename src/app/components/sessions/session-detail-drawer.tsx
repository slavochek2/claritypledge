import { CheckCircle2, XCircle, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { RoundSummaryScreen } from '@/app/components/partners/round-summary-screen';
import type { SessionSummary } from '@/app/data/sessions-service';
import type { SessionHistoryItem } from '@/app/types';

// ─── Round row ────────────────────────────────────────────────────────────────

function RoundRow({ item, index, onClick }: { item: SessionHistoryItem; index: number; onClick?: () => void }) {
  const isSkipped = !!item.skipped;

  if (isSkipped || !onClick) {
    return (
      <li className={`flex items-start gap-3 py-3 px-4 ${isSkipped ? 'opacity-60' : ''}`}>
        {isSkipped ? (
          <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-label="Skipped" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-label="Completed" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {item.title || `Round ${index + 1}`}
          </p>
          {isSkipped && <p className="text-xs text-muted-foreground mt-0.5">Skipped</p>}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-start gap-3 py-3 px-4 hover:bg-muted/50 transition-colors text-left"
      >
        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-label="Completed" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">
            {item.title || `Round ${index + 1}`}
          </p>
          {item.checkerRating !== undefined && item.responderRating !== undefined && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Checker: {item.checkerRating}, You: {item.responderRating}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      </button>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Public component ─────────────────────────────────────────────────────────

interface SessionDetailDrawerProps {
  session: SessionSummary | null;
  onClose: () => void;
}

export function SessionDetailDrawer({ session, onClose }: SessionDetailDrawerProps) {
  const isOpen = session !== null;
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);

  const handleClose = () => {
    setSelectedRoundIndex(null);
    onClose();
  };

  const selectedRound = selectedRoundIndex !== null ? session?.sessionHistory[selectedRoundIndex] : null;

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DrawerContent className="max-h-[85vh] pb-safe">
        <DrawerHeader className="relative">
          <button
            onClick={selectedRound ? () => setSelectedRoundIndex(null) : handleClose}
            className="absolute right-4 top-4 p-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={selectedRound ? 'Back' : 'Close'}
          >
            {selectedRound ? <ChevronRight className="w-4 h-4 rotate-180" /> : <X className="w-4 h-4" />}
          </button>
          <DrawerTitle className="pr-8">
            {selectedRound
              ? (selectedRound.title || `Round ${selectedRoundIndex! + 1}`)
              : (session ? `${formatDate(session.date)} · ${session.partnerName}` : '')}
          </DrawerTitle>
          <DrawerDescription>
            {selectedRound ? '' : (session ? `${session.roundCount} round${session.roundCount !== 1 ? 's' : ''} completed` : '')}
          </DrawerDescription>
        </DrawerHeader>

        {session && (
          <div className="overflow-y-auto flex-1 pb-6">
            {selectedRound ? (
              <div className="px-4 pt-2">
                <RoundSummaryScreen
                  item={selectedRound}
                  onBack={() => setSelectedRoundIndex(null)}
                />
              </div>
            ) : session.sessionHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground px-4 py-3">No round details available for this session.</p>
            ) : (
              <ul aria-live="polite" aria-label="Session detail loaded">
                {session.sessionHistory.map((item, i) => (
                  <RoundRow
                    key={i}
                    item={item}
                    index={i}
                    onClick={item.skipped ? undefined : () => setSelectedRoundIndex(i)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
