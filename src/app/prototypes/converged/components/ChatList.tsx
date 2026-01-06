import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { chats, getUserById, getIdeaById, formatTimeAgo } from '../data/mock-data';
import { routes } from '../config';
import { BottomNav } from './BottomNav';

export function ChatList() {
  const navigate = useNavigate();

  // Sort chats by last activity
  const sortedChats = [...chats].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-gray-900">Chats</h1>
          <button
            className="w-10 h-10 flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
            aria-label="New chat"
          >
            <Plus size={24} />
          </button>
        </div>
      </header>

      {/* Chat list */}
      <div className="divide-y divide-gray-100">
        {sortedChats.map((chat) => {
          // Find the other participant (not current user)
          const otherUserId = chat.participantIds.find(id => id !== 'current');
          const otherUser = getUserById(otherUserId || '');
          const lastMessage = chat.messages[chat.messages.length - 1];
          const unreadCount = chat.messages.filter(m => !m.isRead && m.senderId !== 'current').length;
          const pinnedIdea = chat.pinnedIdeaId ? getIdeaById(chat.pinnedIdeaId) : null;

          if (!otherUser) return null;

          return (
            <button
              key={chat.id}
              onClick={() => navigate(routes.chat(otherUserId || ''))}
              className="w-full px-4 py-3 bg-white hover:bg-gray-50 flex items-start gap-3 text-left transition-colors"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl">
                  {otherUser.avatar}
                </div>
                {/* Online indicator */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-gray-900 truncate">
                    {otherUser.name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTimeAgo(chat.lastActivity)}
                  </span>
                </div>

                {/* Last message preview */}
                <p className="text-sm text-gray-500 truncate mt-0.5">
                  {lastMessage?.senderId === 'current' ? 'You: ' : ''}
                  {lastMessage?.text || 'No messages yet'}
                </p>

                {/* Pinned idea indicator */}
                {pinnedIdea && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-blue-500">
                      💡 Discussing: {pinnedIdea.text.slice(0, 30)}...
                    </span>
                  </div>
                )}
              </div>

              {/* Unread badge */}
              {unreadCount > 0 && (
                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {sortedChats.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-2">No conversations yet</p>
            <p className="text-sm">Start a chat from an idea's detail page</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
