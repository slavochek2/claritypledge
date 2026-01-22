import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Globe, Users, Lock, Pin, MessageCircle, ExternalLink, Radio, BookOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { routes } from '../config';
import { getUserById, formatTimeAgo, getPointsForStory, getStoriesForPoint, getPointPositionCounts, currentUser } from '../data/mock-data';
import { PositionBadge, PositionButtons, ShareDropdown } from './shared';
import type { Story, Point } from '../../shared/types';
import type { PositionType } from '../../shared/types';

interface StoryCardProps {
  story: Story;
  compact?: boolean;
  isDetailView?: boolean;
  /** Optional position badge to show (e.g., when displayed in Point context) */
  authorPosition?: PositionType;
  /** Show "Verify" button in card footer */
  showVerifyButton?: boolean;
  /** Callback for verify button */
  onVerify?: (e: React.MouseEvent) => void;
  /** Hide expanded linked Points (show count only). Use when displaying inside a Point context. */
  hideLinkedPoints?: boolean;
}

/**
 * StoryCard - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 * Pattern B: Yellow border line shows linked Points
 */
export function StoryCard({
  story,
  compact = false,
  isDetailView = false,
  authorPosition,
  showVerifyButton = false,
  onVerify,
  hideLinkedPoints = false,
}: StoryCardProps) {
  const navigate = useNavigate();
  const author = getUserById(story.authorId);
  const linkedPoints = getPointsForStory(story.id);

  const handleCardClick = () => {
    if (!isDetailView) {
      navigate(routes.story(story.id));
    }
  };

  const cardClassName = isDetailView
    ? "bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden"
    : "group bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all";

  // Privacy icon based on visibility
  const PrivacyIcon = story.visibility === 'public' ? Globe
    : story.visibility === 'shared' ? Users
    : Lock;
  const privacyLabel = story.visibility === 'public' ? 'Public'
    : story.visibility === 'shared' ? 'Shared'
    : 'Private';

  return (
    <div className={cardClassName} onClick={handleCardClick}>
      {/* Main content */}
      <div className="p-4">
        {/* Author row with avatar */}
        {author && (
          <div className="flex gap-3">
            {/* Avatar column */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(routes.profileById(author.id));
              }}
              className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0 hover:ring-2 hover:ring-blue-200 transition-all"
            >
              {author.avatar}
            </button>

            {/* Content column - aligned under avatar */}
            <div className="flex-1 min-w-0">
              {/* Author info row */}
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(routes.profileById(author.id));
                      }}
                      className="font-semibold text-gray-900 hover:underline text-sm"
                    >
                      {author.name}
                    </button>
                    {authorPosition && (
                      <>
                        <span className="text-xs text-gray-400">·</span>
                        <PositionBadge
                          position={authorPosition}
                          name={author.name.split(' ')[0]}
                          isCurrentUser={story.authorId === currentUser.id}
                        />
                      </>
                    )}
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-gray-400 cursor-default">
                            <PrivacyIcon size={12} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{privacyLabel}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {/* Action buttons - appear on hover (always visible on touch devices) */}
                  {!isDetailView && (
                    <div
                      className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(routes.story(story.id));
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink size={12} />
                        Open
                      </button>
                      <ShareDropdown type="story" id={story.id} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {author.role} · {formatTimeAgo(story.createdAt)}
                </p>
              </div>

              {/* Story text - indented under author */}
              <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
                {story.text}
              </p>

              {/* Stats row - icon-only style */}
              <TooltipProvider delayDuration={100}>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-500">
                    {/* 1. Linked points count */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Pin size={14} />
                          {linkedPoints.length}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Linked points</p>
                      </TooltipContent>
                    </Tooltip>
                    {/* 2. Clarity sessions (antenna/live icon) */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Radio size={14} />
                          {story.verificationCount}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clarity sessions completed</p>
                      </TooltipContent>
                    </Tooltip>
                    {/* 3. Clarity across disagreement (lightning) */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <Zap size={14} />
                          {story.crossDisagreementCount ?? 0}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clarity across disagreement</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {showVerifyButton && (
                    <button
                      onClick={onVerify}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                    >
                      <MessageCircle size={12} />
                      Verify
                    </button>
                  )}
                </div>
              </TooltipProvider>

              {/* Quoted Points - Twitter quote style, shown when not hidden */}
              {linkedPoints.length > 0 && !hideLinkedPoints && (
                <div className="mt-3 space-y-2">
                  {linkedPoints.map(point => (
                    <QuotedPoint
                      key={point.id}
                      point={point}
                      authorName={author.name}
                      authorId={story.authorId}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(routes.point(point.id));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Twitter-style quoted Point card - always visible, not expandable
 * Position buttons are interactive using same style as main PointCard
 */
function QuotedPoint({
  point,
  authorName,
  authorId,
  onClick
}: {
  point: Point;
  authorName: string;
  authorId: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [userPosition, setUserPosition] = useState<PositionType | null>(
    point.positions['current']?.position || null
  );
  const authorPosition = point.positions[authorId]?.position;
  const linkedStories = getStoriesForPoint(point.id);
  const counts = getPointPositionCounts(point);
  const isCurrentUser = authorId === currentUser.id;

  const handlePositionClick = (position: PositionType) => {
    setUserPosition(userPosition === position ? null : position);
  };

  return (
    <button
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors"
    >
      {/* Author position at top */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Pin size={12} className="text-slate-400" />
          {authorPosition && (
            <PositionBadge
              position={authorPosition}
              name={authorName.split(' ')[0]}
              isCurrentUser={isCurrentUser}
            />
          )}
        </div>
        <ExternalLink size={10} className="text-slate-400 opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100 transition-opacity" />
      </div>
      {/* Point text */}
      <p className="text-sm text-gray-800 line-clamp-2">{point.text}</p>
      {/* Stats row with interactive position buttons */}
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default">
                <BookOpen size={12} />
                {linkedStories.length}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Linked stories</p>
            </TooltipContent>
          </Tooltip>
          {/* Compact position buttons - same style as main PointCard */}
          <PositionButtons
            userPosition={userPosition}
            counts={counts}
            onPositionClick={handlePositionClick}
            compact
          />
        </div>
      </TooltipProvider>
    </button>
  );
}
