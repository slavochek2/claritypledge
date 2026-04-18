'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface LetterLiveOverlayProps {
  sessionCode: string;
  onComplete: () => void;
}

export function LetterLiveOverlay({ sessionCode, onComplete }: LetterLiveOverlayProps) {
  useEffect(() => {
    // Subscribe to session status changes — call onComplete when session ends
    const channel = supabase
      .channel(`letter-live-overlay-${sessionCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clarity_sessions',
          filter: `code=eq.${sessionCode}`,
        },
        (payload) => {
          const newStatus = payload.new['status'] as string | undefined;
          if (newStatus === 'completed') {
            onComplete();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionCode, onComplete]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clarity Live session"
      className="fixed inset-0 z-50 bg-white"
    >
      <iframe
        src={`/live/${sessionCode}`}
        className="w-full h-full border-0"
        title="Clarity Live session"
        allow="microphone"
      />
    </div>
  );
}
