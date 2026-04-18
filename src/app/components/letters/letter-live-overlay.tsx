'use client';

interface LetterLiveOverlayProps {
  sessionCode: string;
}

export function LetterLiveOverlay({ sessionCode }: LetterLiveOverlayProps) {
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
