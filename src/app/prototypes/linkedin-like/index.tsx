import { Routes, Route, Navigate } from 'react-router-dom';
import { Feed } from './components/Feed';
import { IdeaDetail } from './components/IdeaDetail';
import { Profile } from './components/Profile';
import { Chat } from './components/Chat';
import { Live } from './components/Live';
import { Topology } from './components/Topology';
// P60: Story and Point exploration
import { StoryDetail } from './components/StoryDetail';
import { PointDetail } from './components/PointDetail';
// New LinkedIn-style nav
import { MyEvents } from './components/MyEvents';
// P55.1 Variant E: Instagram Stories-inspired Ideas UX
import { StoriesDemo } from './pages/StoriesDemo';

export function LinkedInLikePrototype() {
  return (
    <Routes>
      {/* Default: go to My Events (dashboard) */}
      <Route path="/" element={<Navigate to="my-events" replace />} />

      {/* Primary nav routes */}
      <Route path="my-events" element={<MyEvents />} />
      <Route path="profile" element={<Profile />} />
      <Route path="profile/:id" element={<Profile />} />

      {/* Content detail pages */}
      <Route path="idea/:id" element={<IdeaDetail />} />
      <Route path="story/:id" element={<StoryDetail />} />
      <Route path="point/:id" element={<PointDetail />} />

      {/* Live sessions */}
      <Route path="live" element={<Live />} />
      <Route path="live/:ideaId" element={<Live />} />

      {/* Demo pages */}
      <Route path="stories-demo" element={<StoriesDemo />} />

      {/* Legacy/other routes - redirect to my-events */}
      <Route path="home" element={<Navigate to="/prototype/linkedin-like/my-events" replace />} />
      <Route path="feed" element={<Navigate to="/prototype/linkedin-like/my-events" replace />} />
      <Route path="explore" element={<Navigate to="/prototype/linkedin-like/my-events" replace />} />
      <Route path="chat" element={<Chat />} />
      <Route path="topology" element={<Topology />} />

      {/* Old feed route */}
      <Route path="ideas" element={<Feed />} />
    </Routes>
  );
}
