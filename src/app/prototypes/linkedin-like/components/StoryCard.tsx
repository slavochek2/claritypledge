import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Zap, Globe, Users, Lock, Crosshair, MessageCircle, Share2, ExternalLink, BookOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { routes } from '../config';
import { getUserById, formatTimeAgo, getPointsForStory } from '../data/mock-data';
import { PositionBadge } from './shared';
import type { Story, Point } from '../../shared/types';

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
}: StoryCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

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
                    <PositionBadge position={authorPosition} />
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-default">
                          <span className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold">C</span>
                          {story.verificationCount}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Clarity sessions completed</p>
                      </TooltipContent>
                    </Tooltip>
                    {(story.crossDisagreementCount ?? 0) > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 text-blue-600 cursor-default">
                            <Zap size={14} />
                            {story.crossDisagreementCount}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Cross-disagreement verifications</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {showVerifyButton && (
                      <button
                        onClick={onVerify}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                      >
                        <MessageCircle size={12} />
                        Verify
                      </button>
                    )}
                    {/* Action buttons - appear on hover */}
                    {!isDetailView && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Share functionality
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          aria-label="Share story"
                        >
                          <Share2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </TooltipProvider>
            </div>
          </div>
        )}
      </div>

      {/* Linked Points section - Pattern B yellow border */}
      {linkedPoints.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Crosshair size={14} className="text-slate-500" />
              Linked Points ({linkedPoints.length})
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expanded && (
            <div className="px-4 py-2 space-y-2 bg-slate-50/50">
              {linkedPoints.map(point => (
                <LinkedPointRow
                  key={point.id}
                  point={point}
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
      )}
    </div>
  );
}

/**
 * Compact row showing a linked Point with position badges
 */
function LinkedPointRow({
  point,
  authorId,
  onClick
}: {
  point: Point;
  authorId: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const author = getUserById(authorId);
  const authorPosition = point.positions[authorId]?.position;
  const yourPosition = point.positions['current']?.position;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg hover:bg-slate-100 transition-colors"
    >
      <p className="text-sm text-gray-800 line-clamp-1">{point.text}</p>
      <div className="flex items-center gap-3 mt-1 text-xs">
        {authorPosition && (
          <span className="text-gray-600">
            {author?.name.split(' ')[0]}: <PositionBadge position={authorPosition} plural={false} variant="label" />
          </span>
        )}
        {yourPosition ? (
          <span className="text-gray-600">
            You: <PositionBadge position={yourPosition} plural={false} variant="label" />
          </span>
        ) : (
          <span className="text-gray-400">You: -</span>
        )}
      </div>
    </button>
  );
}
