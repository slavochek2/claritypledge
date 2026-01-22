// Shared route configuration for LinkedIn-like prototype
// Centralizes all route paths to avoid hardcoded strings scattered across components

export const ROUTE_BASE = '/prototype/linkedin-like';

export const routes = {
  // Primary nav (LinkedIn-style)
  feed: `${ROUTE_BASE}/feed`,           // Discovery feed (Stories/Points)
  myEvents: `${ROUTE_BASE}/my-events`,  // Dashboard (was "explore" on logged-out, "home/dashboard" on prod)
  home: `${ROUTE_BASE}/my-events`,      // Alias for dashboard (used by "Back to Dashboard" links)
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
  explore: `${ROUTE_BASE}/explore`,     // Alias for feed (backward compat)
  chat: `${ROUTE_BASE}/chat`,
  topology: `${ROUTE_BASE}/topology`,
} as const;

// Primary navigation for logged-in users (LinkedIn-style)
export const primaryNav = [
  { id: 'feed', label: 'Feed', path: routes.feed },
  { id: 'my-events', label: 'My Events', path: routes.myEvents },
  { id: 'profile', label: 'My Profile', path: routes.profile },
] as const;

// Legacy: old tabs config (kept for backward compat)
export const navTabs = [
  { id: 'feed', label: 'Feed', path: routes.feed },
  { id: 'my-events', label: 'My Events', path: routes.myEvents },
  { id: 'profile', label: 'Profile', path: routes.profile },
] as const;
