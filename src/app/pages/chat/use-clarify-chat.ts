/**
 * P1631: Clarify on a whole chat. `clarifyChat(id)` starts the first draft (the chat-list row's Clarify); `clarifyChat(id, { draft: false })` only opens the thread
 * (New point, which waits for the owner's own words). Either way the Mirror opens beside THAT chat.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { startClarifyChat } from '@/app/data/clarify-service';
import { pressClarify } from './clarify-press';
import { chatPath } from './chat-view-model';

export function useClarifyChat(): (conversationId: string, opts?: { draft?: boolean }) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useCallback((conversationId, { draft = true } = {}) => {
    pressClarify({
      start: () => startClarifyChat(conversationId, { draft }),
      navigate, here: () => locationRef.current, alive: () => mounted.current,
      startedAt: locationRef.current.pathname, openOn: chatPath(conversationId), run: draft,
    });
  }, [navigate]);
}
