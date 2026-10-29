/**
 * P1542 round 9 (founder): after "Accept and join", a short welcome before the thank-you — one primary (the
 * community's chat), one quiet way back. The chat path comes from the chat list the shell already holds (the group
 * page's pattern, org-page.tsx); a just-joined channel may not be in it yet, so the list is read again once, on the tap.
 * Round 9b: never sends anyone to /home — no chat found → the group's own page; and a tap whose refresh lands after
 * the person has moved on (left the screen, or the location changed) navigates nowhere.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { ChatContext } from '@/app/pages/chat/chat-state';
// HOME: groupChatPath's "no chat found" answer (the chats list, since P1545 /chats), never a place to send someone.
import { groupChatPath, HOME } from '@/app/pages/chat/chat-view-model';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';


export function JoinedWelcome({ community, orgId, orgSlug, onContinue }: {
  /** The group's name as stored (real data, never a fixed string). */
  community: string;
  orgId: string;
  orgSlug: string;
  onContinue: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const chatContext = useContext(ChatContext);
  const [opening, setOpening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const locationKey = useRef(location.key);
  locationKey.current = location.key;
  const groupPage = `/groups/${orgSlug}`;
  const chatOrGroup = (path: string) => (path === HOME ? groupPage : path);

  const openChat = async () => {
    if (opening) return;
    const known = groupChatPath(chatContext?.chats ?? [], orgId);
    if (known !== HOME || !chatContext?.refresh) return navigate(chatOrGroup(known));
    const startedAt = locationKey.current;
    setOpening(true);
    try {
      const refreshed = (await chatContext.refresh()) ?? [];
      if (mounted.current && locationKey.current === startedAt) navigate(chatOrGroup(groupChatPath(refreshed, orgId)));
    } catch {
      if (mounted.current && locationKey.current === startedAt) navigate(groupPage);
    } finally {
      if (mounted.current) setOpening(false);
    }
  };

  return (
    <section className="flex flex-col items-center pt-6 text-center min-[520px]:min-h-[calc(100dvh-var(--chrome,0px))] min-[520px]:justify-center min-[520px]:pt-2" data-testid="step-welcome">
      <Check className="h-8 w-8 text-green-600" aria-hidden="true" />
      {/* [FOUNDER DECISION: heading — default "Welcome, you're in"] */}
      <h1 className="mt-2 text-2xl font-bold leading-tight text-foreground [text-wrap:balance]" data-testid="step-question">Welcome, you're in</h1>
      <p className="mt-2 text-base text-muted-foreground [text-wrap:balance]" data-testid="welcome-community">You are now a member of {community}.</p>
      <div className="mt-10 w-full max-w-sm">
        <LetterPrimaryCta label="Open the community chat" disabled={opening} onClick={() => void openChat()} />
      </div>
      <button type="button" onClick={onContinue} className="mt-4 min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" data-testid="welcome-continue">
        Back to your feedback
      </button>
    </section>
  );
}
