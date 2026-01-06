import { Routes, Route, Navigate } from 'react-router-dom';
import { Feed } from './components/Feed';
import { IdeaDetail } from './components/IdeaDetail';
import { StoryView } from './components/StoryView';
import { ChatList } from './components/ChatList';
import { ChatConversation } from './components/ChatConversation';
import { LiveSession } from './components/LiveSession';
import { Profile } from './components/Profile';

export function ConvergedPrototype() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="feed" replace />} />
      <Route path="feed" element={<Feed />} />
      <Route path="idea/:id" element={<IdeaDetail />} />
      <Route path="story/:userId" element={<StoryView />} />
      <Route path="chats" element={<ChatList />} />
      <Route path="chat/:userId" element={<ChatConversation />} />
      <Route path="live" element={<LiveSession />} />
      <Route path="profile" element={<Profile />} />
      <Route path="profile/:id" element={<Profile />} />
    </Routes>
  );
}
