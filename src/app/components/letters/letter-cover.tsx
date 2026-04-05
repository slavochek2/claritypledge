/**
 * @file letter-cover.tsx
 * @description P581 Task 7: Letter cover component shown before reading begins.
 * Parchment-style cover with sender/receiver info and "Open the Letter" CTA.
 */

import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import type { LetterMode } from '@/app/types';

interface LetterCoverProps {
  senderName: string;
  receiverName: string;
  storyCount: number;
  estimatedMinutes: number;
  mode: LetterMode;
  onOpen: () => void;
  isAuthenticating?: boolean;
  authDelayed?: boolean;
}

export function LetterCover({
  senderName,
  receiverName,
  storyCount,
  estimatedMinutes,
  mode,
  onOpen,
  isAuthenticating = false,
  authDelayed = false,
}: LetterCoverProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 py-10">
      {/* Envelope icon */}
      <div className="w-16 h-16 rounded-full bg-[#0044CC]/10 flex items-center justify-center">
        <Mail className="w-8 h-8 text-[#0044CC]" />
      </div>

      {/* Title */}
      <div className={`space-y-2 transition-opacity duration-300 ${isAuthenticating ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs uppercase tracking-widest text-[#1A1A1A]/40 font-medium">
          A Clarity Letter
        </p>
        <h1
          className="text-2xl md:text-3xl font-serif text-[#1A1A1A]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          For {receiverName}
        </h1>
        <p className="text-sm text-[#1A1A1A]/60">
          From {senderName}
        </p>
      </div>

      {/* Stats */}
      <p className={`text-sm text-[#1A1A1A]/50 transition-opacity duration-300 ${isAuthenticating ? 'opacity-50 pointer-events-none' : ''}`}>
        {storyCount} {storyCount === 1 ? 'story' : 'stories'} &middot; ~{estimatedMinutes} {estimatedMinutes === 1 ? 'minute' : 'minutes'}
      </p>

      {/* CTA */}
      <Button
        onClick={onOpen}
        disabled={isAuthenticating}
        size="lg"
        className="bg-[#0044CC] hover:bg-[#0033AA] text-white text-base px-8 py-6 min-h-[48px] disabled:opacity-100"
        aria-busy={isAuthenticating}
        aria-label={isAuthenticating ? 'Opening the letter, please wait' : undefined}
      >
        {isAuthenticating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />
            Opening...
          </>
        ) : (
          'Open the Letter'
        )}
      </Button>

      {/* Delayed auth message */}
      {authDelayed && (
        <p className="text-xs text-[#1A1A1A]/40 animate-pulse">
          Setting up your access...
        </p>
      )}

      {/* ToS for 1-to-1 (D48) */}
      {mode === 'one-to-one' && (
        <p className="text-[10px] md:text-xs text-[#1A1A1A]/50 max-w-xs">
          By opening, you accept the{' '}
          <Link to="/terms-of-service" className="underline hover:text-[#1A1A1A]">
            Terms of Service
          </Link>
        </p>
      )}
    </div>
  );
}
