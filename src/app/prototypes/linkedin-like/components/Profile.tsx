import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Ear, Sparkles } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { PointCard } from './PointCard';
import { StoryCard } from './StoryCard';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { getUserById, currentUser, getUserCalibration, mockPoints, mockStories, getUserCredibilityStats } from '../data/mock-data';
import { CalibrationDisplay, InlineCalibration } from './shared/CalibrationDisplay';
import { ShareDialog } from './shared/ShareDialog';
import { MobileTooltip } from './shared/MobileTooltip';
import { routes } from '../config';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
type ContentTab = 'points' | 'stories';

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showShareDialog, setShowShareDialog] = useState(false);
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

  // Get credibility stats (Ear/Mic) from shared function for consistency
  const credibilityStats = getUserCredibilityStats(user?.id || '');

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
        <div className="relative max-w-4xl mx-auto pb-20">
          {/* Main profile content - centered */}
          <div className="max-w-lg mx-auto px-4 mt-3">
              {/* Back button - dynamic navigation */}
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate(routes.myEvents)}
                className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
              >
                <ArrowLeft size={16} className="mr-1" />
                Back
              </button>

              {/* Profile header card - matches production compact-profile-card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                {/* Top row: Avatar + Name/Role + Share button */}
                <div className="flex items-start gap-4">
                  {/* Avatar - blue ring only if pledger */}
                  <div className="flex-shrink-0">
                    <GravatarAvatar
                      name={user.name}
                      size="lg"
                      isPledger={user.hasPledged}
                    />
                  </div>

                  {/* Name and Role */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900 truncate">{user.name}</h2>
                      {credibilityStats.ear > 0 && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-sm text-gray-400 cursor-default">
                                <Ear size={14} />
                                {credibilityStats.ear}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{user.name.split(' ')[0]} understood {credibilityStats.ear} {credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {user.role && (
                      <p className="text-sm text-gray-500 truncate">{user.role}{user.company && ` at ${user.company}`}</p>
                    )}
                    {user.hasPledged && (
                      <button
                        onClick={() => navigate(routes.profileById(user.id))}
                        className="text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                      >
                        See their Clarity Pledge
                      </button>
                    )}
                  </div>

                  {/* Share button - top right like cards */}
                  <MobileTooltip content="Share profile">
                    <button
                      onClick={() => setShowShareDialog(true)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                      aria-label="Share profile"
                    >
                      <Share2 size={16} />
                    </button>
                  </MobileTooltip>
                </div>


                {/* Calibration bars - inline */}
                {calibration && (
                  <InlineCalibration calibration={calibration} />
                )}
              </div>

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
                      <StoryCard key={story.id} story={story} context="profile" />
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
          <ShareDialog
            open={showShareDialog}
            onOpenChange={setShowShareDialog}
            type="profile"
            url={`${window.location.origin}/prototype/linkedin-like/profile/${user.id}`}
            title={`${user.name}'s Clarity Profile`}
            description={`Check out ${user.name}'s positions on Clarity`}
          />
        </div>
      </PrototypeLayout>
    );
  }

  // Own profile
  const ownCalibration = getUserCalibration(user.id);

  return (
    <PrototypeLayout>
      <div className="relative max-w-4xl mx-auto pb-20">
        {/* Main profile content - centered */}
        <div className="max-w-lg mx-auto px-4 mt-3">
            {/* Back button - dynamic navigation */}
            <button
              onClick={() => window.history.length > 1 ? navigate(-1) : navigate(routes.myEvents)}
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
            >
              <ArrowLeft size={16} className="mr-1" />
              Back
            </button>

            {/* Profile header card - matches production compact-profile-card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              {/* Top row: Avatar + Name/Role + Share button */}
              <div className="flex items-start gap-4">
                {/* Avatar - blue ring only if pledger */}
                <div className="flex-shrink-0">
                  <GravatarAvatar
                    name={user.name}
                    size="lg"
                    isPledger={user.hasPledged}
                  />
                </div>

                {/* Name and Role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900 truncate">{user.name}</h2>
                    {credibilityStats.ear > 0 && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 text-sm text-gray-400 cursor-default">
                              <Ear size={14} />
                              {credibilityStats.ear}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>You understood {credibilityStats.ear} {credibilityStats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {user.role && (
                    <p className="text-sm text-gray-500 truncate">{user.role}{user.company && ` at ${user.company}`}</p>
                  )}
                  {user.hasPledged ? (
                    <button
                      onClick={() => navigate(routes.profileById(user.id))}
                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                    >
                      See my Clarity Pledge
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/sign-pledge')}
                      className="text-sm text-blue-500 hover:text-blue-600 hover:underline mt-1"
                    >
                      Take the Clarity Pledge
                    </button>
                  )}
                </div>

                {/* Share button - top right like cards */}
                <MobileTooltip content="Share profile">
                  <button
                    onClick={() => setShowShareDialog(true)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    aria-label="Share profile"
                  >
                    <Share2 size={16} />
                  </button>
                </MobileTooltip>
              </div>


              {/* Calibration bars - inline */}
              {ownCalibration && (
                <InlineCalibration calibration={ownCalibration} />
              )}
            </div>

            {/* Create Stories & Points CTA */}
            <div className="pt-3">
              <button
                onClick={() => navigate('/prototype/linkedin-like/sift')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
              >
                <Sparkles size={18} />
                <span className="text-sm font-medium">Create Stories & Points</span>
              </button>
            </div>

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
                    <p className="text-gray-500 mb-4">No stories shared yet</p>
                    <button
                      onClick={() => navigate('/prototype/linkedin-like/sift')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Sparkles size={16} />
                      Share your first story
                    </button>
                  </div>
                ) : (
                  userStories.map((story) => (
                    <StoryCard key={story.id} story={story} context="profile" />
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
        <ShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          type="profile"
          url={`${window.location.origin}/prototype/linkedin-like/profile/${user.id}`}
          title={`${user.name}'s Clarity Profile`}
          description={`Check out ${user.name}'s positions on Clarity`}
        />
      </div>
    </PrototypeLayout>
  );
}
