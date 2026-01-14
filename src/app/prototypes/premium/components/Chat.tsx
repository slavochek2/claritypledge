import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Radio, Lightbulb } from 'lucide-react';
import {
  mockMessages,
  mockUsers,
  getUserById,
  currentUser,
  getIdeaById,
  formatTimeAgo,
  type Message
} from '../data/mock-data';
import { BottomNav } from './BottomNav';
import { routes } from '../config';

export function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get the other user in the conversation (mock: first user from mockUsers)
  const otherUser = mockUsers[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      text: inputText.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages([...messages, newMessage]);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm">
              {otherUser.avatar}
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-gray-900">{otherUser.name}</h1>
              <p className="text-[11px] text-green-500">Online</p>
            </div>
          </div>
          <button
            onClick={() => navigate(routes.live)}
            aria-label="Start a live verification session"
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] bg-[#007AFF] text-white rounded-full text-[13px] font-medium transition-all hover:bg-[#0066DD] active:scale-95"
          >
            <Radio size={14} aria-hidden="true" />
            Go Live
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-auto px-4 py-4 max-w-[500px] mx-auto w-full">
        <div className="space-y-3">
          {messages.map((message) => {
            const isOwn = message.senderId === currentUser.id;
            const sender = getUserById(message.senderId);
            const linkedIdea = message.ideaId ? getIdeaById(message.ideaId) : null;

            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${isOwn ? 'order-2' : 'order-1'}`}>
                  {/* Message Bubble */}
                  <div
                    className={`
                      px-4 py-2.5 rounded-2xl
                      ${isOwn
                        ? 'bg-[#007AFF] text-white rounded-br-md'
                        : 'bg-white text-gray-900 rounded-bl-md shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                      }
                    `}
                  >
                    <p className="text-[15px] leading-relaxed">{message.text}</p>
                  </div>

                  {/* Linked Idea */}
                  {linkedIdea && (
                    <button
                      onClick={() => navigate(routes.idea(linkedIdea.id))}
                      className="mt-2 w-full p-3 min-h-[44px] bg-white rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb size={14} className="text-[#007AFF] mt-0.5 shrink-0" />
                        <p className="text-[13px] text-gray-700 line-clamp-2">{linkedIdea.text}</p>
                      </div>
                    </button>
                  )}

                  {/* Timestamp */}
                  <p className={`text-[11px] text-gray-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                    {formatTimeAgo(message.createdAt)}
                  </p>
                </div>

                {/* Avatar (only for other user) */}
                {!isOwn && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs mr-2 mt-auto shrink-0">
                    {sender?.avatar}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] bg-white border-t border-gray-200">
        <div className="flex items-end gap-2 px-4 py-3 max-w-[500px] mx-auto">
          <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none resize-none max-h-[120px]"
              style={{ minHeight: '24px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={`
              w-9 h-9 rounded-full flex items-center justify-center transition-all
              ${inputText.trim()
                ? 'bg-[#007AFF] text-white active:scale-95'
                : 'bg-gray-100 text-gray-300'
              }
            `}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
