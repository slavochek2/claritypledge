/**
 * @file ChatLinkCard.tsx
 * @description P1652: the card of the first own-app story, point or letter-overview address in a message's words, drawn below them.
 * QUIET: nothing is drawn while loading, on error or when the reader has no access (no skeleton, no "Not available", no reserved space); the
 * link stays in every case. It reads only when near the viewport (the list mounts every loaded message), the read is cached per link, and a late
 * answer for a link since edited away is ignored. Never drawn when the message already has an attachment, in a quote, or in the excluded places:
 * callers simply do not render it there.
 */
import { useEffect, useMemo, useState } from 'react';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { HIDE_CARD_CHROME } from './AttachmentCard';
import { ArtifactCardView } from './ArtifactAttachmentCard';
import { firstCardTarget } from './chat-link-targets';
import { loadLinkCard, type LinkCardData } from './link-card-cache';

/** True once the element has come within a screen of the viewport (and stays true). */
function useNearViewport(): [(el: HTMLSpanElement | null) => void, boolean] {
  // A state ref: the observer re-runs when the element appears (a link edited into a message that had none).
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el, near]);
  return [setEl, near];
}

function Drawn({ data, viewerId }: { data: LinkCardData; viewerId: string }) {
  if (data.kind === 'letter') return <ArtifactCardView kind="letter" artifact={data.artifact} />;
  const { item } = data;
  return (
    <div className={`mt-1 w-full max-w-md ${HIDE_CARD_CHROME}`} data-testid={`link-card-${data.kind}`}>
      {data.kind === 'point' && item.point && <FeedPointCard point={item.point} />}
      {data.kind === 'story' && item.story && <FeedStoryCard story={item.story} linkedPoints={item.linkedPoints} currentUserId={viewerId} />}
    </div>
  );
}

export function ChatLinkCard({ body, viewerId, spoken = false }: { body: string | null | undefined; viewerId: string; spoken?: boolean }) {
  const target = useMemo(() => firstCardTarget(body, spoken), [body, spoken]);
  const kind = target?.kind;
  const id = target?.id;
  const [ref, near] = useNearViewport();
  const [shown, setShown] = useState<{ key: string; data: LinkCardData } | null>(null);
  // The viewer is part of the key: another person never sees a card drawn for the previous one.
  const key = kind && id ? `${viewerId}|${kind}:${id}` : null;
  useEffect(() => {
    if (!kind || !id || !near) return;
    let live = true; // false once the link was edited away or the row left: a late answer writes nothing
    void loadLinkCard({ kind, id }, viewerId).then((data) => live && setShown(data ? { key: `${viewerId}|${kind}:${id}`, data } : null));
    return () => {
      live = false;
    };
  }, [kind, id, near, viewerId]);
  if (!key) return null;
  // The shown card is only ever for the link now in the words.
  const data = shown?.key === key ? shown.data : null;
  return (
    <>
      <span ref={ref} aria-hidden="true" className="block h-0" />
      {data && <Drawn data={data} viewerId={viewerId} />}
    </>
  );
}
