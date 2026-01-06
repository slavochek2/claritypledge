// Navigation and route configuration for Converged Prototype

export const routes = {
  feed: '/prototype/converged/feed',
  idea: (id: string) => `/prototype/converged/idea/${id}`,
  chats: '/prototype/converged/chats',
  chat: (id: string) => `/prototype/converged/chat/${id}`,
  live: '/prototype/converged/live',
  profile: '/prototype/converged/profile',
  profileUser: (id: string) => `/prototype/converged/profile/${id}`,
  story: (userId: string) => `/prototype/converged/story/${userId}`,
};

export type TabId = 'ideas' | 'chats' | 'live' | 'profile';

export interface NavTab {
  id: TabId;
  label: string;
  icon: string;
  path: string;
}

export const navTabs: NavTab[] = [
  { id: 'ideas', label: 'Ideas', icon: 'home', path: routes.feed },
  { id: 'chats', label: 'Chats', icon: 'message', path: routes.chats },
  { id: 'live', label: 'Live', icon: 'mic', path: routes.live },
  { id: 'profile', label: 'Profile', icon: 'user', path: routes.profile },
];

// Design tokens from spec
export const colors = {
  agree: '#10B981',      // green-500
  disagree: '#EF4444',   // red-500
  unsure: '#6B7280',     // gray-500
  primary: '#3B82F6',    // blue-500
  verified: '#8B5CF6',   // purple-500
  bg: '#FFFFFF',
  card: '#F9FAFB',
  text: '#111827',
  muted: '#6B7280',
};
