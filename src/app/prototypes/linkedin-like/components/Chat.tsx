import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Radio, MoreHorizontal } from 'lucide-react';
import { BottomNav } from './BottomNav';
import {
  mockMessages,
  mockUsers,
  getUserById,
  getIdeaById,
  currentUser,
  formatTimeAgo,
} from '../data/mock-data';

interface Conversation {
  id: string;
  participantId: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

// Group messages by sender to simulate conversations
const conversations: Conversation[] = [
  {
    id: '1',
    participantId: '1',
    lastMessage: 'Want to go live and verify properly?',
    lastMessageTime: '2026-01-04T09:20:00Z',
    unreadCount: 1,
  },
  {
    id: '2',
    participantId: '2',
    lastMessage: 'Great discussion on the AI replacement idea!',
    lastMessageTime: '2026-01-03T16:00:00Z',
    unreadCount: 0,
  },
  {
    id: '3',
    participantId: '3',
    lastMessage: 'Thanks for verifying my understanding.',
    lastMessageTime: '2026-01-02T14:30:00Z',
    unreadCount: 0,
  },
];

export function Chat() {
  const navigate = useNavigate();
  const [selectedConversation, setSelectedConversation] = useState<string | null>('1');
  const [newMessage, setNewMessage] = useState('');

  const activeConversation = conversations.find(c => c.id === selectedConversation);
  const participant = activeConversation ? getUserById(activeConversation.participantId) : null;

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    // In a real app, this would send the message
    setNewMessage('');
  };

  return (
    <div className="min-h-screen bg-white pb-16 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-40">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          {selectedConversation ? (
            <>
              <button
                onClick={() => setSelectedConversation(null)}
                className="p-1 text-gray-600 hover:text-gray-900 sm:hidden"
              >
                <ArrowLeft size={22} />
              </button>
              <button
                onClick={() => navigate(`/prototype/linkedin-like/profile/${participant?.id}`)}
                className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg"
              >
                {participant?.avatar}
              </button>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{participant?.name}</p>
                <p className="text-xs text-gray-500">{participant?.role}</p>
              </div>
              <button className="p-2 text-gray-600 hover:text-gray-900">
                <MoreHorizontal size={20} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate(-1)}
                className="p-1 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft size={22} />
              </button>
              <h1 className="font-semibold text-gray-900 flex-1">Messages</h1>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex max-w-lg mx-auto w-full">
        {/* Conversation list (hidden on mobile when chat open) */}
        <div className={`${selectedConversation ? 'hidden sm:block' : ''} w-full sm:w-80 border-r border-gray-200`}>
          <div className="divide-y divide-gray-100">
            {conversations.map(conv => {
              const convParticipant = getUserById(conv.participantId);
              const isActive = conv.id === selectedConversation;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={`w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 ${
                    isActive ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">
                      {convParticipant?.avatar}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 text-sm">{convParticipant?.name}</p>
                      <span className="text-xs text-gray-400">{formatTimeAgo(conv.lastMessageTime)}</span>
                    </div>
                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                      {conv.lastMessage}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        {selectedConversation ? (
          <div className={`${!selectedConversation ? 'hidden sm:flex' : ''} flex-1 flex flex-col`}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {mockMessages.map(msg => {
                const isOwn = msg.senderId === 'current';
                const sender = getUserById(msg.senderId);
                const linkedIdea = msg.ideaId ? getIdeaById(msg.ideaId) : null;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${isOwn ? 'order-2' : ''}`}>
                      {!isOwn && (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">
                            {sender?.avatar}
                          </div>
                          <span className="text-xs text-gray-500">{sender?.name}</span>
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          isOwn
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm">{msg.text}</p>
                      </div>

                      {/* Linked idea card */}
                      {linkedIdea && (
                        <button
                          onClick={() => navigate(`/prototype/linkedin-like/idea/${linkedIdea.id}`)}
                          className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-100"
                        >
                          <p className="text-xs text-gray-500 mb-1">Referenced Idea</p>
                          <p className="text-sm text-gray-900 line-clamp-2">{linkedIdea.text}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {linkedIdea.verificationCount} verifications
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/prototype/linkedin-like/live/${linkedIdea.id}`);
                              }}
                              className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700"
                            >
                              <Radio size={12} />
                              Go Live
                            </button>
                          </div>
                        </button>
                      )}

                      <span className={`text-xs ${isOwn ? 'text-right' : ''} text-gray-400 block mt-1`}>
                        {formatTimeAgo(msg.createdAt)}
                        {isOwn && msg.read && ' • Read'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message input */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Write a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden sm:flex flex-1 items-center justify-center text-gray-400">
            Select a conversation to start messaging
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
