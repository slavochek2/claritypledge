'use client';

import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';

interface LetterLiveBannerProps {
  invite: OpenLiveInvite;
  onJoin: () => void;
  onLater?: () => void;
}

export function LetterLiveBanner({ invite, onJoin, onLater }: LetterLiveBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-3">
          <GravatarAvatar
            name={invite.authorName}
            photoUrl={invite.inviterPhotoUrl ?? undefined}
            avatarColor={invite.inviterAvatarColor ?? undefined}
            isPledger={invite.inviterIsPledger}
          />
          <span className="text-sm font-medium text-blue-900">
            {invite.authorName} is inviting you to Clarity
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onJoin}
            className="w-full sm:w-auto bg-blue-500 text-white text-sm font-medium rounded-md min-h-11 px-4 hover:bg-blue-600 transition-colors"
          >
            Join
          </button>
          {onLater && (
            <button
              onClick={onLater}
              className="text-sm text-blue-700 hover:text-blue-900 min-h-11 px-2 transition-colors"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
