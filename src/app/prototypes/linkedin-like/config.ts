// Shared route configuration for LinkedIn-like prototype
// Centralizes all route paths to avoid hardcoded strings scattered across components

export const ROUTE_BASE = '/prototype/linkedin-like';

export const routes = {
  feed: `${ROUTE_BASE}/feed`,
  idea: (id: string) => `${ROUTE_BASE}/idea/${id}`,
  // P60: Story and Point routes
  story: (id: string) => `${ROUTE_BASE}/story/${id}`,
  point: (id: string) => `${ROUTE_BASE}/point/${id}`,
  explore: `${ROUTE_BASE}/explore`,
  profile: `${ROUTE_BASE}/profile`,
  profileById: (id: string) => `${ROUTE_BASE}/profile/${id}`,
  chat: `${ROUTE_BASE}/chat`,
  live: `${ROUTE_BASE}/live`,
  liveWithIdea: (ideaId: string) => `${ROUTE_BASE}/live/${ideaId}`,
  liveHistory: (ideaId: string) => `${ROUTE_BASE}/live/${ideaId}/history`,
  topology: `${ROUTE_BASE}/topology`,
} as const;

// Navigation tabs configuration
export const navTabs = [
  { id: 'feed', label: 'Ideas', path: routes.feed },
  { id: 'explore', label: 'Explore', path: routes.explore },
  { id: 'chat', label: 'Chat', path: routes.chat },
  { id: 'live', label: 'Live', path: routes.live },
  { id: 'profile', label: 'Profile', path: routes.profile },
] as const;
