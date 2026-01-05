import { Routes, Route, Navigate } from 'react-router-dom';
import { Feed } from './components/Feed';
import { IdeaDetail } from './components/IdeaDetail';
import { Profile } from './components/Profile';
import { Chat } from './components/Chat';
import { Live } from './components/Live';
import { Topology } from './components/Topology';

export function PremiumPrototype() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="feed" replace />} />
      <Route path="feed" element={<Feed />} />
      <Route path="idea/:id" element={<IdeaDetail />} />
      <Route path="profile" element={<Profile />} />
      <Route path="profile/:id" element={<Profile />} />
      <Route path="chat" element={<Chat />} />
      <Route path="live" element={<Live />} />
      <Route path="topology" element={<Topology />} />
    </Routes>
  );
}
