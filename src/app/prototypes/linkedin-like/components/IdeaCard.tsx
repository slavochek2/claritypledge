import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Share2, Check, Copy, Zap, Users, Globe, Lock, ExternalLink } from 'lucide-react';
import { Idea, Position, getPositionCounts, getUserById, getAllVerificationSessionsForIdea, formatTimeAgo } from '../data/mock-data';
import { PositionButtons, type SevenPointCounts } from './shared';
import { getPositionGroup } from '../../shared/types';
import type { PositionType, PositionButtonGroup } from '../../shared/types';
import { routes } from '../config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';

interface IdeaCardProps {
  idea: Idea;
  compact?: boolean;
  profileUserId?: string; // When viewing on someone else's profile
  isDetailView?: boolean; // When used in IdeaDetail page (no click navigation, show own position banner)
}

export function IdeaCard({ idea, compact = false, profileUserId, isDetailView = false }: IdeaCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userPosition, setUserPosition] = useState<Position>(idea.positions['current']?.position || null);
  const [verifyPanelOpen, setVerifyPanelOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showDeleteIdeaConfirm, setShowDeleteIdeaConfirm] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if we're on a profile page
  const isOnProfilePage = location.pathname.includes('/profile');

  // When viewing someone else's profile, get their position
  const isOtherUserProfile = profileUserId && profileUserId !== 'current';
  const profileUserEntry = profileUserId ? idea.positions[profileUserId] : null;
  const profileUserPosition = profileUserEntry?.position || null;
  const profileUser = profileUserId ? getUserById(profileUserId) : null;

  const baseCounts = getPositionCounts(idea);

  // Track initial position from mock data
  const initialPosition = idea.positions['current']?.position || null;

  // Compute adjusted counts based on user's current position vs initial
  const counts = useMemo((): SevenPointCounts => {
    // Start with base counts distributed to default positions
    const adjusted: SevenPointCounts = {
      strongly_agree: 0,
      agree: baseCounts.agree,
      somewhat_agree: 0,
      unsure: baseCounts.unsure,
      somewhat_disagree: 0,
      disagree: baseCounts.disagree,
      strongly_disagree: 0,
    };

    // Helper to get the group for a position
    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };

    const initialGroup = getGroup(initialPosition as PositionType | null);
    const currentGroup = getGroup(userPosition as PositionType | null);

    // Adjust counts based on position change
    if (initialGroup !== currentGroup) {
      // Decrease count for initial group (if any)
      if (initialGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
      else if (initialGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (initialGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

      // Increase count for current group (if any)
      if (currentGroup === 'agree') adjusted.agree++;
      else if (currentGroup === 'disagree') adjusted.disagree++;
      else if (currentGroup === 'unsure') adjusted.unsure++;
    }

    return adjusted;
  }, [baseCounts, initialPosition, userPosition]);

  // Get ALL verification sessions for the panel
  const allVerificationSessions = getAllVerificationSessionsForIdea(idea.id);

  // Count ALL verifications on this idea (global stats for idea card)
  // And separately count MY verifications (for profile view)
  let globalVerifications = 0;
  let globalAcrossDisagreement = 0;
  let myVerifications = 0;
  let myAcrossDisagreement = 0;

  for (const session of allVerificationSessions) {
    const [p1, p2] = session.participants;
    const verifiedBy = session.verifiedBy || [];
    const ratings = session.ratings || {};
    const isMySession = p1 === 'current' || p2 === 'current';

    // Get positions of participants
    const p1Position = idea.positions[p1]?.position;
    const p2Position = idea.positions[p2]?.position;
    const isDifferentPosition = p1Position && p2Position && p1Position !== p2Position;

    // Count global verifications
    if (verifiedBy.includes(p1) && ratings[p1] !== undefined) {
      globalVerifications++;
      if (isDifferentPosition) globalAcrossDisagreement++;
      if (isMySession) {
        myVerifications++;
        if (isDifferentPosition) myAcrossDisagreement++;
      }
    }
    if (verifiedBy.includes(p2) && ratings[p2] !== undefined) {
      globalVerifications++;
      if (isDifferentPosition) globalAcrossDisagreement++;
      if (isMySession) {
        myVerifications++;
        if (isDifferentPosition) myAcrossDisagreement++;
      }
    }
  }

  // Always show global stats - KISS
  const displayVerifications = globalVerifications;
  const displayAcrossDisagreement = globalAcrossDisagreement;

  // Get idea author info
  const author = idea.createdBy ? getUserById(idea.createdBy) : null;

  // Check if current user is the author
  const isAuthor = idea.createdBy === 'current';

  const handlePositionClick = (position: Position) => {
    const isRemovingPosition = userPosition === position;

    // If author tries to remove position, show delete idea dialog
    if (isRemovingPosition && isAuthor) {
      setShowDeleteIdeaConfirm(true);
      return;
    }

    // If non-author removing position while on profile page, show confirmation
    if (isRemovingPosition && isOnProfilePage) {
      setShowRemoveConfirm(true);
      return;
    }

    // Toggle: clicking same position removes it, clicking different changes it
    // For authors: only allow changing position, not removing (handled above)
    setUserPosition(isRemovingPosition ? null : position);
  };

  const confirmRemovePosition = () => {
    setUserPosition(null);
    setShowRemoveConfirm(false);
  };

  // Verify button toggles inline panel
  const handleVerifyButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVerifyPanelOpen(!verifyPanelOpen);
  };

  // Card styling - clickable in list view, static in detail view
  const cardClassName = isDetailView
    ? "bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative"
    : "group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all relative";

  const handleCardClick = () => {
    if (!isDetailView) {
      navigate(routes.idea(idea.id));
    }
  };

  // Helper for profile user's position text
  const getPositionLabel = (pos: Position) => {
    if (pos === 'agree') return { text: 'Agreed', icon: '✓', color: 'text-blue-600' };
    if (pos === 'disagree') return { text: 'Disagreed', icon: '✗', color: 'text-slate-600' };
    return { text: 'Unsure', icon: '−', color: 'text-gray-500' };
  };

  return (
    <>
      <div
        className={cardClassName}
        onClick={handleCardClick}
      >
        {/* Twitter-style layout: avatar on left, content indented */}
        <div className="flex gap-3 px-4 pt-3">
          {/* Avatar column */}
          {author && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/prototype/linkedin-like/profile/${author.id}`);
              }}
              className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0 hover:ring-2 hover:ring-blue-200 transition-all self-start"
            >
              {author.avatar}
            </button>
          )}

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Author name + date + profile user's position (on their profile) */}
            {author && (
              <div className="flex items-center gap-1 text-sm flex-wrap">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/prototype/linkedin-like/profile/${author.id}`);
                  }}
                  className="font-semibold text-gray-900 hover:underline"
                >
                  {author.name}
                </button>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">
                  {idea.createdAt ? formatTimeAgo(idea.createdAt) : ''}
                </span>
                {/* Visibility badge */}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-gray-400 cursor-default">
                        {idea.visibility === 'public' && <Globe size={14} />}
                        {idea.visibility === 'shared' && <Users size={14} />}
                        {idea.visibility === 'private' && <Lock size={14} />}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Visibility: {idea.visibility === 'public' ? 'Public' : idea.visibility === 'shared' ? 'Shared' : 'Private'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Show profile user's position inline when on their profile */}
                {isOtherUserProfile && profileUser && profileUserPosition && (
                  <>
                    <span className="text-gray-400">·</span>
                    <span className={`font-medium ${getPositionLabel(profileUserPosition).color}`}>
                      {profileUser.name.split(' ')[0]} {getPositionLabel(profileUserPosition).text} {getPositionLabel(profileUserPosition).icon}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Idea text */}
            <p className={`text-gray-900 mt-1 ${compact ? 'text-sm line-clamp-2' : 'text-base'}`}>
              {idea.text}
            </p>

            {/* Position buttons */}
            <div
              className="py-3 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <PositionButtons
                userPosition={userPosition}
                counts={counts}
                onPositionClick={handlePositionClick}
              />
            </div>

            {/* Stats row - positions, clarity sessions, across disagreement, share */}
            <TooltipProvider delayDuration={100}>
            <div className="py-2 flex items-center justify-between border-t border-gray-100 text-gray-500">
              <div className="flex items-center gap-5">
                {/* Positions count */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 text-sm cursor-default">
                      <Users size={16} />
                      <span>{counts.agree + counts.disagree + counts.unsure}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{counts.agree + counts.disagree + counts.unsure} positions taken</p>
                  </TooltipContent>
                </Tooltip>
                {/* Clarity sessions */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 text-sm cursor-default">
                      <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold">C</span>
                      <span>{displayVerifications}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{displayVerifications} clarity sessions</p>
                  </TooltipContent>
                </Tooltip>
                {/* Across disagreement - always show for consistent layout */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`flex items-center gap-1.5 text-sm cursor-default ${displayAcrossDisagreement > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                      <Zap size={16} />
                      <span>{displayAcrossDisagreement}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{displayAcrossDisagreement} verified across disagreement</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* Action buttons - appear on hover */}
              {!isDetailView && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.idea(idea.id));
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink size={12} />
                    Open
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowShareDialog(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                      >
                        <Share2 size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Share this idea</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Remove Position Confirmation Dialog (for non-authors) */}
      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from profile?</DialogTitle>
            <DialogDescription>
              Removing your position will remove this idea from your profile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowRemoveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemovePosition}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Idea Confirmation Dialog (for authors only) */}
      <Dialog open={showDeleteIdeaConfirm} onOpenChange={setShowDeleteIdeaConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this idea?</DialogTitle>
            <DialogDescription>
              As the author, you can't remove your position without deleting the idea. This will remove the idea for everyone who engaged with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowDeleteIdeaConfirm(false)}
            >
              Keep idea
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                // TODO: Implement delete idea
                console.log('Delete idea:', idea.id);
                setShowDeleteIdeaConfirm(false);
              }}
            >
              Delete idea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <ShareDialog
        open={showShareDialog}
        onOpenChange={(open) => {
          setShowShareDialog(open);
          if (!open) setCopied(false);
        }}
        idea={idea}
        userPosition={userPosition}
        copied={copied}
        onCopy={() => {
          const shareUrl = `${window.location.origin}${routes.idea(idea.id)}?from=current`;
          navigator.clipboard?.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      />
    </>
  );
}

// Share dialog component - KISS: just copy button with feedback
function ShareDialog({
  open,
  onOpenChange,
  idea,
  userPosition,
  copied,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea: Idea;
  userPosition: Position;
  copied: boolean;
  onCopy: () => void;
}) {
  const shareUrl = `${window.location.origin}${routes.idea(idea.id)}?from=current`;
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleNativeShare = () => {
    navigator.share({
      title: 'Check out my stance on this idea',
      text: idea.text,
      url: shareUrl,
    }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Share this idea</DialogTitle>
        </DialogHeader>

        {/* Idea preview */}
        <div className="bg-gray-50 rounded-lg p-3 border">
          <p className="text-sm text-gray-700 line-clamp-2">{idea.text}</p>
          {userPosition && (
            <div className="mt-2">
              <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                userPosition === 'agree' ? 'bg-blue-100 text-blue-700' :
                userPosition === 'disagree' ? 'bg-slate-100 text-slate-700' :
                'bg-gray-200 text-gray-600'
              }`}>
                {userPosition === 'agree' ? '✓ You agreed' : userPosition === 'disagree' ? '✗ You disagreed' : '− You\'re unsure'}
              </span>
            </div>
          )}
        </div>

        {/* Link display - full URL */}
        <div className="bg-gray-100 rounded-md px-3 py-2 text-xs text-gray-500 font-mono overflow-x-auto">
          <span className="whitespace-nowrap">{shareUrl}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={onCopy}
            variant="outline"
            className={`flex-1 ${copied ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
          >
            {copied ? (
              <>
                <Check size={16} className="mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} className="mr-2" />
                Copy link
              </>
            )}
          </Button>
          {hasNativeShare && (
            <Button onClick={handleNativeShare} className="flex-1">
              <Share2 size={16} className="mr-2" />
              Share
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
