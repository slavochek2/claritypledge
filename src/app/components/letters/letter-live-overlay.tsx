'use client';

import { useEffect } from 'react';

interface LetterLiveOverlayProps {
  sessionCode: string;
  onClose?: () => void;
}

export function LetterLiveOverlay({ sessionCode, onClose }: LetterLiveOverlayProps) {
  useEffect(() => {
    if (!onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clarity Live session"
      className="fixed inset-0 z-[60] bg-white"
    >
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close live session"
          className="absolute top-3 right-3 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
        >
          <span aria-hidden="true" className="text-lg leading-none">✕</span>
        </button>
      )}
      <iframe
        src={`/live/${encodeURIComponent(sessionCode)}`}
        className="w-full h-full border-0"
        title="Clarity Live session"
        allow="microphone"
      />
    </div>
  );
}
