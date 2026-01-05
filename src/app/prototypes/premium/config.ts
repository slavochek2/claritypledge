// Shared route configuration for Premium prototype
// Centralizes all route paths to avoid hardcoded strings scattered across components

export const ROUTE_BASE = '/prototype/premium';

export const routes = {
  feed: `${ROUTE_BASE}/feed`,
  idea: (id: string) => `${ROUTE_BASE}/idea/${id}`,
  profile: `${ROUTE_BASE}/profile`,
  profileById: (id: string) => `${ROUTE_BASE}/profile/${id}`,
  chat: `${ROUTE_BASE}/chat`,
  live: `${ROUTE_BASE}/live`,
  topology: `${ROUTE_BASE}/topology`,
} as const;

// Navigation tabs configuration
export const navTabs = [
  { id: 'feed', label: 'Ideas', path: routes.feed },
  { id: 'chat', label: 'Chat', path: routes.chat },
  { id: 'live', label: 'Live', path: routes.live },
  { id: 'profile', label: 'Profile', path: routes.profile },
  { id: 'topology', label: 'Network', path: routes.topology },
] as const;
