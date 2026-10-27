// Parses /chats, /chats/c/:conversationId, /chats/c/:conversationId/t/:rootId. Re-exported from chat-view-model.

export interface ChatRoute {
  conversationId: string | null;
  rootId: string | null;
}

export function parseChatRoute(pathname: string): ChatRoute {
  const m = /^\/chats\/c\/([^/]+)(?:\/t\/([^/]+))?\/?$/.exec(pathname);
  return { conversationId: m?.[1] ?? null, rootId: m?.[2] ?? null };
}
