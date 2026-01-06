import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, ChevronLeft, ArrowRightLeft, CheckCircle2, MessageSquare } from 'lucide-react';
import {
  currentUser,
  getUserById,
  mockIdeas,
  mockCertifications,
  formatTimeAgo,
  type User
} from '../data/mock-data';
import { BottomNav } from './BottomNav';
import { routes } from '../config';

type TabType = 'all' | 'positions' | 'verifications';

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('all');

  // Determine which user to show
  const isOwnProfile = !id || id === 'current';
  const user: User | undefined = isOwnProfile ? currentUser : getUserById(id);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">User not found</p>
      </div>
    );
  }

  // Calculate stats
  const userPositions = mockIdeas.filter(idea =>
    Object.keys(idea.positions).some(userId => userId === user.id)
  );

  const userVerifications = mockCertifications.filter(
    cert => cert.listenerId === user.id
  );

  const crossDisagreementVerifications = userVerifications.filter(
    cert => cert.speakerPosition !== cert.listenerPosition
  );

  // Build activity feed
  const activities = [
    ...userPositions.map(idea => ({
      type: 'position' as const,
      idea,
      position: idea.positions[user.id],
      timestamp: idea.createdAt,
    })),
    ...userVerifications.map(cert => ({
      type: 'verification' as const,
      cert,
      timestamp: cert.createdAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredActivities = activities.filter(activity => {
    if (activeTab === 'all') return true;
    if (activeTab === 'positions') return activity.type === 'position';
    if (activeTab === 'verifications') return activity.type === 'verification';
    return true;
  });

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'All Activity' },
    { id: 'positions', label: 'Positions' },
    { id: 'verifications', label: 'Verifications' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          {!isOwnProfile ? (
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={24} className="text-blue-500" />
            </button>
          ) : (
            <div className="w-10" />
          )}
          <h1 className="text-[17px] font-semibold text-gray-900">
            {isOwnProfile ? 'Profile' : user.name}
          </h1>
          {isOwnProfile ? (
            <button className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Settings size={20} className="text-gray-500" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </header>

      {/* Content */}
      <main className="px-5 pb-28 max-w-[500px] mx-auto">
        {/* Hero Section */}
        <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-3xl shadow-sm mb-3">
              {user.avatar}
            </div>
            <h2 className="text-[24px] font-semibold text-gray-900 tracking-tight">
              {user.name}
            </h2>
            {user.bio && (
              <p className="text-[14px] text-gray-500 text-center mt-1">
                {user.bio}
              </p>
            )}
          </div>

          {/* Score Badges */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <CheckCircle2 size={18} className="text-blue-500" />
                <span className="text-[34px] font-semibold text-gray-900 tabular-nums">
                  {user.verifiedListenerScore}
                </span>
              </div>
              <span className="text-[12px] text-gray-400 mt-1">Verified Listener</span>
            </div>

            {crossDisagreementVerifications.length > 0 && (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1">
                  <ArrowRightLeft size={18} className="text-blue-500" />
                  <span className="text-[34px] font-semibold text-gray-900 tabular-nums">
                    {crossDisagreementVerifications.length}
                  </span>
                </div>
                <span className="text-[12px] text-gray-400 mt-1">Across Disagreement</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-around bg-white rounded-[20px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4">
          <div className="flex flex-col items-center">
            <span className="text-[20px] font-semibold text-gray-900 tabular-nums">
              {userPositions.length}
            </span>
            <span className="text-[12px] text-gray-400">Positions</span>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <span className="text-[20px] font-semibold text-gray-900 tabular-nums">
              {userVerifications.length}
            </span>
            <span className="text-[12px] text-gray-400">Verifications</span>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <span className="text-[20px] font-semibold text-gray-900 tabular-nums">
              {mockIdeas.filter(i => i.createdBy === user.id).length}
            </span>
            <span className="text-[12px] text-gray-400">Ideas</span>
          </div>
        </div>

        {/* Activity Section */}
        <div className="bg-white rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] mt-4 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 py-3 text-[13px] font-medium transition-colors relative
                  ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'}
                `}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Activity List */}
          <div className="divide-y divide-gray-100">
            {filteredActivities.length > 0 ? (
              filteredActivities.map((activity, index) => {
                if (activity.type === 'position') {
                  const positionColor = {
                    agree: 'text-green-600 bg-green-50',
                    disagree: 'text-red-600 bg-red-50',
                    dont_know: 'text-gray-600 bg-gray-100',
                  }[activity.position || 'dont_know'];

                  return (
                    <button
                      key={`pos-${index}`}
                      onClick={() => navigate(routes.idea(activity.idea.id))}
                      className="w-full p-4 min-h-[44px] text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${positionColor}`}>
                          {activity.position === 'agree' && '✓'}
                          {activity.position === 'disagree' && '✗'}
                          {activity.position === 'dont_know' && '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-gray-900 line-clamp-2">
                            {activity.idea.text}
                          </p>
                          <p className="text-[12px] text-gray-400 mt-1">
                            Marked as {activity.position?.replace('_', ' ')} · {formatTimeAgo(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                }

                if (activity.type === 'verification') {
                  const speaker = getUserById(activity.cert.speakerId);
                  const isCross = activity.cert.speakerPosition !== activity.cert.listenerPosition;

                  return (
                    <div
                      key={`ver-${index}`}
                      className={`p-4 ${isCross ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCross ? 'bg-blue-100 text-blue-500' : 'bg-green-50 text-green-600'}`}>
                          {isCross ? <ArrowRightLeft size={14} /> : <CheckCircle2 size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-gray-900">
                            Verified understanding of <span className="font-medium">{speaker?.name}</span>
                            {isCross && <span className="text-blue-500"> across disagreement</span>}
                          </p>
                          <p className="text-[12px] text-gray-400 mt-1">
                            {formatTimeAgo(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })
            ) : (
              <div className="p-8 text-center">
                <MessageSquare size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-[14px] text-gray-400">No activity yet</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
