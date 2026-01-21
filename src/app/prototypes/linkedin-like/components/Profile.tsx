import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Users, Lock, ChevronDown, Check, Share2, Copy, Zap } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PrototypeLayout } from './PrototypeLayout';
import { PointCard } from './PointCard';
import { StoryCard } from './StoryCard';
import { FilterTabs, type PositionFilter } from './shared/FilterTabs';
import { getUserById, currentUser, getUserMetrics, getUserCalibration, mockPoints, mockStories } from '../data/mock-data';
import { CalibrationDisplay } from './shared/CalibrationDisplay';
import { routes } from '../config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Point, Story } from '../../shared/types';

type IdeaVisibility = 'public' | 'shared' | 'private';
type ContentTab = 'points' | 'stories';

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [newIdeaText, setNewIdeaText] = useState('');
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [ideaVisibility, setIdeaVisibility] = useState<IdeaVisibility>('public');
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [activeFilter, setActiveFilter] = useState<PositionFilter>('all');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('points');

  const isOwnProfile = !id || id === 'current';
  const user = isOwnProfile ? currentUser : getUserById(id || '');

  // Get Points where this user has taken a position
  const userPoints = mockPoints.filter(
    (point) =>
      point.positions[user?.id || ''] !== null &&
      point.positions[user?.id || ''] !== undefined
  );

  // Get Stories authored by this user
  const userStories = mockStories.filter(
    (story) => story.authorId === user?.id
  );

  // Calculate counts for Points filter
  const pointsCounts = {
    all: userPoints.length,
    agree: userPoints.filter(p => p.positions[user?.id || '']?.position === 'agree').length,
    disagree: userPoints.filter(p => p.positions[user?.id || '']?.position === 'disagree').length,
    dont_know: userPoints.filter(p => p.positions[user?.id || '']?.position === 'dont_know').length,
  };

  // Filter Points by position
  const filteredPoints = activeFilter === 'all'
    ? userPoints
    : userPoints.filter((point) => {
        const entry = point.positions[user?.id || ''];
        return entry?.position === activeFilter;
      });

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
    const myCalibration = getUserCalibration('current');

    return (
      <PrototypeLayout>
        <div className="relative max-w-4xl mx-auto pb-8">
          {/* Calibration sidebar - positioned to not affect main content centering */}
          {calibration && (
            <div className="absolute left-4 top-3 w-44 hidden xl:block">
              <CalibrationDisplay
                calibration={calibration}
                comparisonCalibration={myCalibration}
                userLabel={user.name.split(' ')[0]}
              />
            </div>
          )}

          {/* Main profile content - centered */}
          <div className="max-w-lg mx-auto px-4 mt-3">
              {/* Profile header card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => navigate(-1)}
                    className="p-1 text-gray-500 hover:text-gray-700 -ml-1"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  >
                    <Share2 size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
                    {user.avatar}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 text-lg">{user.name}</h2>
                    {user.role && (
                      <p className="text-sm text-gray-600">{user.role}{user.company && ` at ${user.company}`}</p>
                    )}
                  </div>
                </div>

                {/* Aggregate metrics row */}
                {(() => {
                  const metrics = getUserMetrics(user.id);
                  return (
                    <TooltipProvider delayDuration={100}>
                      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-100 text-gray-500">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1.5 text-sm cursor-default">
                              <Users size={16} />
                              <span>{metrics.positionsTaken}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Positions taken on Points</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1.5 text-sm cursor-default">
                              <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold">C</span>
                              <span>{metrics.claritySessions}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Clarity sessions completed</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`flex items-center gap-1.5 text-sm cursor-default ${metrics.crossVerifications > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                              <Zap size={16} />
                              <span>{metrics.crossVerifications}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Cross-disagreement verifications</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  );
                })()}
              </div>

              {/* Content tab selector + Position filter tabs (combined for Points) */}
              <div className="bg-white border border-gray-200 mt-3 rounded-lg overflow-hidden">
                {/* Points / Stories tabs */}
                <div className="flex border-b border-gray-200">
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
                </div>

                {/* Position filter tabs - only for Points */}
                {contentTab === 'points' && (
                  <FilterTabs
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    counts={pointsCounts}
                  />
                )}
              </div>

              {/* Content list */}
              <div className="pt-4 space-y-3">
                {contentTab === 'points' ? (
                  filteredPoints.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 text-center">
                      <p className="text-gray-500">No positions taken yet</p>
                    </div>
                  ) : (
                    filteredPoints.map((point) => (
                      <PointCard key={point.id} point={point} />
                    ))
                  )
                ) : (
                  userStories.length === 0 ? (
                    <div className="bg-white rounded-lg p-8 text-center">
                      <p className="text-gray-500">No stories shared yet</p>
                    </div>
                  ) : (
                    userStories.map((story) => (
                      <StoryCard key={story.id} story={story} />
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
        {/* Calibration sidebar - positioned to not affect main content centering */}
        {ownCalibration && (
          <div className="absolute left-4 top-3 w-44 hidden xl:block">
            <CalibrationDisplay calibration={ownCalibration} />
          </div>
        )}

        {/* Main profile content - centered */}
        <div className="max-w-lg mx-auto px-4 mt-3">
            {/* Profile header card */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
                  {user.avatar}
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-gray-900 text-lg">{user.name}</h2>
                  {user.role && (
                    <p className="text-sm text-gray-600">{user.role}{user.company && ` at ${user.company}`}</p>
                  )}
                </div>
                <button
                  onClick={() => setShowShareDialog(true)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors self-start"
                >
                  <Share2 size={18} />
                </button>
              </div>

              {/* Aggregate metrics row */}
              {(() => {
                const metrics = getUserMetrics(user.id);
                return (
                  <TooltipProvider delayDuration={100}>
                    <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-100 text-gray-500">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1.5 text-sm cursor-default">
                            <Users size={16} />
                            <span>{metrics.positionsTaken}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Positions taken on Points</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1.5 text-sm cursor-default">
                            <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold">C</span>
                            <span>{metrics.claritySessions}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Clarity sessions completed</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`flex items-center gap-1.5 text-sm cursor-default ${metrics.crossVerifications > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                            <Zap size={16} />
                            <span>{metrics.crossVerifications}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Cross-disagreement verifications</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                );
              })()}
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

            {/* Content tab selector + Position filter tabs (combined for Points) */}
            <div className="bg-white border border-gray-200 mt-3 rounded-lg overflow-hidden">
              {/* Points / Stories tabs */}
              <div className="flex border-b border-gray-200">
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
              </div>

              {/* Position filter tabs - only for Points */}
              {contentTab === 'points' && (
                <FilterTabs
                  activeFilter={activeFilter}
                  onFilterChange={setActiveFilter}
                  counts={pointsCounts}
                />
              )}
            </div>

            {/* Content list */}
            <div className="pt-4 space-y-3">
              {contentTab === 'points' ? (
                filteredPoints.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <p className="text-gray-500">
                      {activeFilter === 'all'
                        ? 'No positions taken yet'
                        : `No points you ${activeFilter === 'agree' ? 'agreed with' : activeFilter === 'disagree' ? 'disagreed with' : "are unsure about"}`
                      }
                    </p>
                  </div>
                ) : (
                  filteredPoints.map((point) => (
                    <PointCard key={point.id} point={point} />
                  ))
                )
              ) : (
                userStories.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center">
                    <p className="text-gray-500">No stories shared yet</p>
                  </div>
                ) : (
                  userStories.map((story) => (
                    <StoryCard key={story.id} story={story} />
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
