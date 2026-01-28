import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, Send, Lightbulb, Plus } from 'lucide-react';
import { getChatWithUser, getUserById, getIdeaById, formatTimeAgo, type Message } from '../data/mock-data';
import { routes } from '../config';
import { MessageContextMenu } from './MessageContextMenu';
import { InsertIdeaMenu } from './InsertIdeaMenu';
import { MyIdeasPicker } from './MyIdeasPicker';
import { CreateIdeaModal } from './CreateIdeaModal';

// ChatMessage component with verification buttons
interface ChatMessageProps {
  message: Message;
  isOwn: boolean;
  otherUserId: string;
  otherUserName: string;
}

function ChatMessage({ message, isOwn, otherUserId, otherUserName }: ChatMessageProps) {
  const navigate = useNavigate();
  const [showVerifyButton, setShowVerifyButton] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showFirstTimeTooltip, setShowFirstTimeTooltip] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Check if this is user's first time (localStorage)
  useEffect(() => {
    const hasSeenHint = localStorage.getItem('hasSeenMessageVerifyHint');
    if (!hasSeenHint) {
      setShowFirstTimeTooltip(true);
      setTimeout(() => {
        setShowFirstTimeTooltip(false);
        localStorage.setItem('hasSeenMessageVerifyHint', 'true');
      }, 3000);
    }
  }, []);

  const handleVerify = () => {
    // Navigate to /live with message context
    navigate(routes.live + `?with=${otherUserId}`, {
      state: {
        partnerId: otherUserId,
        messageId: message.id,
        messageText: message.text,
        convertToIdea: true,
      }
    });
  };

  // Long-press handlers (300ms)
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      // Haptic feedback (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
      setShowContextMenu(true);
    }, 300); // iOS standard timing
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setShowVerifyButton(true)}
      onMouseLeave={() => setShowVerifyButton(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowContextMenu(true);
      }}
    >
      <div className="flex flex-col gap-1 max-w-[80%]">
        {/* Message bubble */}
        <div
          className={`
            rounded-lg px-3 py-2 shadow-sm
            ${isOwn
              ? 'bg-[#dcf8c6] rounded-br-none'
              : 'bg-white rounded-bl-none'
            }
          `}
        >
          <p className="text-[15px] text-gray-800 leading-relaxed">
            {message.text}
          </p>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-gray-500">
              {formatTimeAgo(message.timestamp)}
            </span>
            {isOwn && (
              <span className="text-blue-500 text-xs">
                {message.isRead ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>

        {/* Verification button (desktop hover) */}
        {showVerifyButton && (
          <div className="relative">
            <button
              onClick={handleVerify}
              className="text-xs text-blue-600 hover:underline self-start px-2"
            >
              {isOwn ? `Did ${otherUserName} understand you?` : `Did you understand ${otherUserName}?`}
            </button>

            {/* First-time tooltip */}
            {showFirstTimeTooltip && (
              <div className="absolute -top-8 left-0 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
                💡 Hover messages to verify understanding
                <div className="absolute -bottom-1 left-4 w-2 h-2 bg-blue-600 rotate-45" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu (mobile long-press) */}
      {showContextMenu && (
        <MessageContextMenu
          message={message}
          isOwn={isOwn}
          otherUserName={otherUserName}
          onVerify={handleVerify}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
}

export function ChatConversation() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modal states for inserting ideas
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMyIdeasPicker, setShowMyIdeasPicker] = useState(false);

  const chat = getChatWithUser(userId || '');
  const otherUser = getUserById(userId || '');
  const pinnedIdea = chat?.pinnedIdeaId ? getIdeaById(chat.pinnedIdeaId) : null;

  useEffect(() => {
    if (chat) {
      setMessages(chat.messages);
    }
  }, [chat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!otherUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">User not found</p>
          <button
            onClick={() => navigate(routes.chats)}
            className="text-blue-500 hover:underline"
          >
            Go back to chats
          </button>
        </div>
      </div>
    );
  }

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const newMsg: Message = {
        id: `m-${Date.now()}`,
        senderId: 'current',
        text: newMessage,
        timestamp: new Date().toISOString(),
        isRead: false,
      };
      setMessages([...messages, newMsg]);
      setNewMessage('');
    }
  };

  const handleGoLive = () => {
    navigate(routes.live + `?with=${userId}`);
  };

  // Get user position on pinned idea
  const getUserPositionOnIdea = (ideaId: string, uId: string) => {
    const idea = getIdeaById(ideaId);
    const engagement = idea?.engagements.find(e => e.userId === uId);
    return engagement?.position;
  };

  const currentUserPosition = pinnedIdea ? getUserPositionOnIdea(pinnedIdea.id, 'current') : null;
  const otherUserPosition = pinnedIdea ? getUserPositionOnIdea(pinnedIdea.id, userId || '') : null;

  const formatPosition = (pos: string | null | undefined) => {
    if (pos === 'agree') return 'Agree';
    if (pos === 'disagree') return 'Disagree';
    if (pos === 'unsure') return 'Unsure';
    return 'No position';
  };

  // Insert idea reference into chat
  const insertIdeaIntoChat = (ideaId: string) => {
    const idea = getIdeaById(ideaId);
    if (!idea) return;

    const newMsg: Message = {
      id: `m-${Date.now()}`,
      senderId: 'current',
      text: `💡 ${idea.text}`,
      timestamp: new Date().toISOString(),
      isRead: false,
      ideaId: ideaId,
    };

    setMessages(prev => [...prev, newMsg]);
  };

  return (
    <div className="min-h-screen bg-[#e5ddd5] flex flex-col">
      {/* Header */}
      <header className="bg-[#075e54] text-white sticky top-0 z-40">
        <div className="flex items-center gap-3 px-2 py-2">
          <button
            onClick={() => navigate(routes.chats)}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-xl">
            {otherUser.avatar}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{otherUser.name}</p>
            <p className="text-xs text-green-200">online</p>
          </div>

          <button
            onClick={handleGoLive}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Mic size={16} />
            Live
          </button>
        </div>
      </header>

      {/* Pinned idea card */}
      {pinnedIdea && (
        <div className="bg-white/90 mx-3 mt-3 rounded-xl p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <Lightbulb size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 line-clamp-2">
                {pinnedIdea.text}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className={currentUserPosition === 'agree' ? 'text-emerald-600' : currentUserPosition === 'disagree' ? 'text-red-600' : 'text-gray-600'}>
                  You: {formatPosition(currentUserPosition)}
                </span>
                <span className={otherUserPosition === 'agree' ? 'text-emerald-600' : otherUserPosition === 'disagree' ? 'text-red-600' : 'text-gray-600'}>
                  {otherUser.name.split(' ')[0]}: {formatPosition(otherUserPosition)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.map((message) => {
          const isOwn = message.senderId === 'current';
          return (
            <ChatMessage
              key={message.id}
              message={message}
              isOwn={isOwn}
              otherUserId={userId || ''}
              otherUserName={otherUser.name}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
        {/* + Button */}
        <button
          onClick={() => setShowInsertMenu(true)}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
          aria-label="Insert idea"
        >
          <Plus size={20} />
        </button>

        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Message"
          className="flex-1 h-10 px-4 bg-white rounded-full text-[15px] placeholder:text-gray-400 focus:outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim()}
          className="w-10 h-10 flex items-center justify-center bg-[#075e54] hover:bg-[#064940] disabled:bg-gray-300 rounded-full text-white transition-colors"
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Safe area */}
      <div className="h-safe-area-inset-bottom bg-[#f0f0f0]" />

      {/* Insert menu */}
      {showInsertMenu && (
        <InsertIdeaMenu
          onSelectNew={() => {
            setShowInsertMenu(false);
            setShowCreateModal(true);
          }}
          onSelectFromMyIdeas={() => {
            setShowInsertMenu(false);
            setShowMyIdeasPicker(true);
          }}
          onClose={() => setShowInsertMenu(false)}
        />
      )}

      {/* Create Idea Modal */}
      {showCreateModal && (
        <CreateIdeaModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onIdeaCreated={(ideaId) => {
            insertIdeaIntoChat(ideaId);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* My Ideas Picker */}
      {showMyIdeasPicker && (
        <MyIdeasPicker
          onSelect={(ideaId) => {
            insertIdeaIntoChat(ideaId);
            setShowMyIdeasPicker(false);
          }}
          onClose={() => setShowMyIdeasPicker(false)}
        />
      )}
    </div>
  );
}
