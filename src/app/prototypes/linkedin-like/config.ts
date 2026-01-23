// Shared route configuration for LinkedIn-like prototype
// Centralizes all route paths to avoid hardcoded strings scattered across components

export const ROUTE_BASE = '/prototype/linkedin-like';

export const routes = {
  // Primary nav (LinkedIn-style)
  home: `${ROUTE_BASE}/home`,           // Discovery home (Stories/Points)
  myEvents: `${ROUTE_BASE}/my-events`,  // Dashboard (events you're part of)
  profile: `${ROUTE_BASE}/profile`,     // My profile

  // Content detail pages
  idea: (id: string) => `${ROUTE_BASE}/idea/${id}`,
  story: (id: string) => `${ROUTE_BASE}/story/${id}`,
  point: (id: string) => `${ROUTE_BASE}/point/${id}`,
  profileById: (id: string) => `${ROUTE_BASE}/profile/${id}`,

  // Live sessions
  live: `${ROUTE_BASE}/live`,
  liveWithIdea: (ideaId: string) => `${ROUTE_BASE}/live/${ideaId}`,
  liveHistory: (ideaId: string) => `${ROUTE_BASE}/live/${ideaId}/history`,

  // Legacy/other
  feed: `${ROUTE_BASE}/feed`,           // Legacy redirect to home
  explore: `${ROUTE_BASE}/explore`,     // Legacy redirect to home
  chat: `${ROUTE_BASE}/chat`,
  topology: `${ROUTE_BASE}/topology`,
} as const;

// Primary navigation for logged-in users (LinkedIn-style)
export const primaryNav = [
  { id: 'home', label: 'Home', path: routes.home },
  { id: 'my-events', label: 'My Events', path: routes.myEvents },
  { id: 'profile', label: 'My Profile', path: routes.profile },
] as const;

// Legacy: old tabs config (kept for backward compat)
export const navTabs = [
  { id: 'home', label: 'Home', path: routes.home },
  { id: 'my-events', label: 'My Events', path: routes.myEvents },
  { id: 'profile', label: 'Profile', path: routes.profile },
] as const;
