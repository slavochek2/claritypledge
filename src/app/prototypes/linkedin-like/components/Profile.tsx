import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Users, Lock, ChevronDown, Check, Share2, Copy, Pin, BookOpen, Radio, Zap } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { PointCard } from './PointCard';
import { StoryCard } from './StoryCard';
import { getUserById, currentUser, getUserCalibration, mockPoints, mockStories } from '../data/mock-data';
import { CalibrationDisplay } from './shared/CalibrationDisplay';
import { routes } from '../config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
type IdeaVisibility = 'public' | 'shared' | 'private';
type ContentTab = 'points' | 'stories';

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [ideaVisibility, setIdeaVisibility] = useState<IdeaVisibility>('public');
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('stories');

  const isOwnProfile = !id || id === 'current';
  const user = isOwnProfile ? currentUser : getUserById(id || '');

  // Get Points where this user has taken a position, sorted by newest position first
  const userId = user?.id || '';
  const userPoints = mockPoints
    .filter((point) => point.positions[userId] != null)
    .sort((a, b) => {
      const aTime = new Date(a.positions[userId]?.timestamp || 0).getTime();
      const bTime = new Date(b.positions[userId]?.timestamp || 0).getTime();
      return bTime - aTime; // Newest first
    });

  // Get Stories authored by this user
  const userStories = mockStories.filter(
    (story) => story.authorId === user?.id
  );

  // Calculate profile totals from stories
  const totalClaritySessions = userStories.reduce((sum, s) => sum + (s.verificationCount || 0), 0);
  const totalClarityAcrossDisagreement = userStories.reduce((sum, s) => sum + (s.crossDisagreementCount ?? 0), 0);

  if (!user) {
    return (
      <PrototypeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-500">User not found</p>
        </div>
      </PrototypeLayout>
    );
  }

  // Viewing someone else's profile
  if (!isOwnProfile) {
    const calibration = getUserCalibration(user.id);

    return (
      <PrototypeLayout>
        <div className="relative max-w-4xl mx-auto pb-8">
          {/* Calibration sidebar - desktop only */}
          {calibration && (
            <div className="absolute right-[calc(50%+280px)] top-14 w-52 hidden xl:block">
              <CalibrationDisplay
                calibration={calibration}
                userLabel={user.name.split(' ')[0]}
              />
            </div>
          )}

          {/* Main profile content - centered */}
          <div className="max-w-lg mx-auto px-4 mt-3">
              {/* Back button - above card like production */}
              <button
                onClick={() => navigate(routes.home)}
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back to Dashboard
              </button>

              {/* Profile header card - matches production compact-profile-card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                {/* Top row: Avatar + Name/Role + Share button */}
                <div className="flex items-start gap-4">
                  {/* Avatar - blue ring only if pledger */}
                  <div className="flex-shrink-0">
                    <div className={`w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl ${
                      user.hasPledged ? 'ring-[3px] ring-blue-500 ring-offset-[3px] ring-offset-white' : ''
                    }`}>
                      {user.avatar}
                    </div>
                  </div>

                  {/* Name and Role */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-gray-900 truncate">{user.name}</h2>
                    {user.role && (
                      <p className="text-sm text-gray-500 truncate">{user.role}{user.company && ` at ${user.company}`}</p>
                    )}
                  </div>

                  {/* Share button - top right like cards */}
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    aria-label="Share profile"
                  >
                    <Share2 size={16} />
                  </button>
                </div>

                {/* Profile stats row with pledge link */}
                <TooltipProvider delayDuration={100}>
                  <div className="flex items-center justify-between mt-4 py-3 border-t border-gray-100">
                    <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-500">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-default">
                            <Pin size={14} />
                            {userPoints.length}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Points</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-default">
                            <BookOpen size={14} />
                            {userStories.length}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Stories</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-default">
                            <Radio size={14} />
                            {totalClaritySessions}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Clarity sessions completed</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-default">
                            <Zap size={14} />
                            {totalClarityAcrossDisagreement}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Clarity across disagreement</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {/* Pledge link - inline with stats */}
                    {user.hasPledged && (
                      <button
                        onClick={() => navigate(routes.profileById(user.id))}
                        className="text-sm text-blue-500 hover:text-blue-600 font-medium whitespace-nowrap"
                      >
                        View pledge →
                      </button>
                    )}
                  </div>
                </TooltipProvider>
              </div>

              {/* Calibration display - mobile/tablet only */}
              {calibration && (
                <div className="mt-3 xl:hidden">
                  <CalibrationDisplay
                    calibration={calibration}
                    userLabel={user.name.split(' ')[0]}
                  />
                </div>
              )}

              {/* Content tab selector */}
              <div className="bg-white border border-gray-200 mt-3 rounded-lg overflow-hidden">
                {/* Stories / Points tabs */}
                <div className="flex">
                  <button
                    onClick={() => setContentTab('stories')}
                    className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                      contentTab === 'stories'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Stories ({userStories.length})
                    {contentTab === 'stories' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                  <button
                    onClick={() => setContentTab('points')}
                    className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                      contentTab === 'points'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Points ({userPoints.length})
                    {contentTab === 'points' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Content list */}
              <div className="pt-4 space-y-3">
                {contentTab === 'stories' ? (
                  userStories.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 text-center">
                      <p className="text-gray-500">No stories shared yet</p>
                    </div>
                  ) : (
                    userStories.map((story) => (
                      <StoryCard key={story.id} story={story} />
                    ))
                  )
                ) : (
                  userPoints.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 text-center">
                      <p className="text-gray-500">No positions taken yet</p>
                    </div>
                  ) : (
                    userPoints.map((point) => (
                      <PointCard key={point.id} point={point} profileOwnerId={user?.id} />
                    ))
                  )
                )}
              </div>
          </div>

          {/* Share Profile Dialog */}
          <ShareProfileDialog
            open={showShareDialog}
            onOpenChange={(open) => {
              setShowShareDialog(open);
              if (!open) setCopied(false);
            }}
            user={user}
            copied={copied}
            onCopy={() => {
              const shareUrl = `${window.location.origin}${routes.profileById(user.id)}`;
              navigator.clipboard?.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          />
        </div>
      </PrototypeLayout>
    );
  }

  // Own profile
  const ownCalibration = getUserCalibration(user.id);

  return (
    <PrototypeLayout>
      <div className="relative max-w-4xl mx-auto pb-8">
        {/* Calibration sidebar - desktop only */}
        {ownCalibration && (
          <div className="absolute right-[calc(50%+280px)] top-14 w-52 hidden xl:block">
            <CalibrationDisplay calibration={ownCalibration} />
          </div>
        )}

        {/* Main profile content - centered */}
        <div className="max-w-lg mx-auto px-4 mt-3">
            {/* Back button - above card like production */}
            <button
              onClick={() => navigate(routes.home)}
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
            >
              <ArrowLeft size={16} className="mr-1" />
              Back to Dashboard
            </button>

            {/* Profile header card - matches production compact-profile-card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {/* Top row: Avatar + Name/Role + Share button */}
              <div className="flex items-start gap-4">
                {/* Avatar - blue ring only if pledger */}
                <div className="flex-shrink-0">
                  <div className={`w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl ${
                    user.hasPledged ? 'ring-[3px] ring-blue-500 ring-offset-[3px] ring-offset-white' : ''
                  }`}>
                    {user.avatar}
                  </div>
                </div>

                {/* Name and Role */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 truncate">{user.name}</h2>
                  {user.role && (
                    <p className="text-sm text-gray-500 truncate">{user.role}{user.company && ` at ${user.company}`}</p>
                  )}
                </div>

                {/* Share button - top right like cards */}
                <button
                  onClick={() => setShowShareDialog(true)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                  aria-label="Share profile"
                >
                  <Share2 size={16} />
                </button>
              </div>

              {/* Profile stats row with pledge link */}
              <TooltipProvider delayDuration={100}>
                <div className="flex items-center justify-between mt-4 py-3 border-t border-gray-100">
                  <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-500">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Pin size={14} />
                          {userPoints.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Points</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <BookOpen size={14} />
                          {userStories.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Stories</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Radio size={14} />
                          {totalClaritySessions}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clarity sessions completed</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Zap size={14} />
                          {totalClarityAcrossDisagreement}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clarity across disagreement</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {/* Pledge link - inline with stats */}
                  {user.hasPledged ? (
                    <button
                      onClick={() => navigate(routes.profileById(user.id))}
                      className="text-sm text-blue-500 hover:text-blue-600 font-medium whitespace-nowrap"
                    >
                      View pledge →
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/sign-pledge')}
                      className="text-sm text-blue-500 hover:text-blue-600 font-medium whitespace-nowrap"
                    >
                      Take pledge →
                    </button>
                  )}
                </div>
              </TooltipProvider>
            </div>

            {/* Inline idea composer */}
            <div className="pt-3">
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">
                    {user.avatar}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={newIdeaText}
                      onChange={(e) => setNewIdeaText(e.target.value)}
                      onFocus={() => setIsComposerExpanded(true)}
                      placeholder="Share an idea you believe in..."
                      className={`w-full text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none text-sm ${
                        isComposerExpanded ? 'h-24' : 'h-6'
                      } transition-all`}
                    />
                    {isComposerExpanded && (
                      <div className="flex items-center justify-between pt-2">
                        {/* Visibility selector */}
                        <div className="relative">
                          <button
                            onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                          >
                            {ideaVisibility === 'public' && <Globe size={14} />}
                            {ideaVisibility === 'shared' && <Users size={14} />}
                            {ideaVisibility === 'private' && <Lock size={14} />}
                            <span className="capitalize">{ideaVisibility}</span>
                            <ChevronDown size={12} />
                          </button>
                          {showVisibilityMenu && (
                            <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[140px]">
                              <button
                                onClick={() => { setIdeaVisibility('public'); setShowVisibilityMenu(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${ideaVisibility === 'public' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                              >
                                <Globe size={16} />
                                <div className="text-left">
                                  <p className="font-medium">Public</p>
                                  <p className="text-xs text-gray-500">Anyone can see</p>
                                </div>
                              </button>
                              <button
                                onClick={() => { setIdeaVisibility('shared'); setShowVisibilityMenu(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${ideaVisibility === 'shared' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                              >
                                <Users size={16} />
                                <div className="text-left">
                                  <p className="font-medium">Shared</p>
                                  <p className="text-xs text-gray-500">Select people</p>
                                </div>
                              </button>
                              <button
                                onClick={() => { setIdeaVisibility('private'); setShowVisibilityMenu(false); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${ideaVisibility === 'private' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                              >
                                <Lock size={16} />
                                <div className="text-left">
                                  <p className="font-medium">Private</p>
                                  <p className="text-xs text-gray-500">Only you</p>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Agree button - creator always agrees with their idea */}
                        <button
                          onClick={() => {
                            if (!newIdeaText.trim()) return;
                            // In a real app, this would create the idea with position: 'agree'
                            setIsComposerExpanded(false);
                            setNewIdeaText('');
                            setShowVisibilityMenu(false);
                          }}
                          disabled={!newIdeaText.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-full transition-colors"
                        >
                          <Check size={16} />
                          Agree
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Calibration display - mobile/tablet only */}
            {ownCalibration && (
              <div className="mt-3 xl:hidden">
                <CalibrationDisplay calibration={ownCalibration} />
              </div>
            )}

            {/* Content tab selector */}
            <div className="bg-white border border-gray-200 mt-3 rounded-lg overflow-hidden">
              {/* Stories / Points tabs */}
              <div className="flex">
                <button
                  onClick={() => setContentTab('stories')}
                  className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                    contentTab === 'stories'
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Stories ({userStories.length})
                  {contentTab === 'stories' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
                <button
                  onClick={() => setContentTab('points')}
                  className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                    contentTab === 'points'
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Points ({userPoints.length})
                  {contentTab === 'points' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Content list */}
            <div className="pt-4 space-y-3">
              {contentTab === 'stories' ? (
                userStories.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <p className="text-gray-500">No stories shared yet</p>
                  </div>
                ) : (
                  userStories.map((story) => (
                    <StoryCard key={story.id} story={story} />
                  ))
                )
              ) : (
                userPoints.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <p className="text-gray-500">No positions taken yet</p>
                  </div>
                ) : (
                  userPoints.map((point) => (
                    <PointCard key={point.id} point={point} profileOwnerId={user?.id} />
                  ))
                )
              )}
            </div>
        </div>

        {/* Share Profile Dialog */}
        <ShareProfileDialog
          open={showShareDialog}
          onOpenChange={(open) => {
            setShowShareDialog(open);
            if (!open) setCopied(false);
          }}
          user={user}
          copied={copied}
          onCopy={() => {
            const shareUrl = `${window.location.origin}${routes.profileById(user.id)}`;
            navigator.clipboard?.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        />
      </div>
    </PrototypeLayout>
  );
}

// Share Profile Dialog - KISS: just copy button with feedback
function ShareProfileDialog({
  open,
  onOpenChange,
  user,
  copied,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name: string; avatar: string; role?: string };
  copied: boolean;
  onCopy: () => void;
}) {
  const shareUrl = `${window.location.origin}/prototype/linkedin-like/profile/${user.id}`;
  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleNativeShare = () => {
    navigator.share({
      title: `${user.name}'s Clarity Profile`,
      text: `Check out ${user.name}'s positions on Clarity`,
      url: shareUrl,
    }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Share profile</DialogTitle>
        </DialogHeader>

        {/* Profile preview */}
        <div className="bg-gray-50 rounded-lg p-3 border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg">
            {user.avatar}
          </div>
          <div>
            <p className="font-medium text-gray-900">{user.name}</p>
            {user.role && <p className="text-xs text-gray-500">{user.role}</p>}
          </div>
        </div>

        {/* Link display */}
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
            <Button onClick={handleNativeShare} className="flex-1 bg-blue-500 hover:bg-blue-600">
              <Share2 size={16} className="mr-2" />
              Share
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
