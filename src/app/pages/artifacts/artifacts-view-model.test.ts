import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  agoPhrase,
  buildArtifacts,
  canvasMeta,
  draftMeta,
  filterByQuery,
  listHasDot,
  resolveArtifactsLocation,
  tabHasDot,
  receivedInboxItems,
  receivedLetterMeta,
  repliedCountByLetter,
  senderActivityItems,
  sentMeta,
  sharedMeta,
  type ArtifactList,
  type ArtifactsSource,
} from './artifacts-view-model';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';
import { canvasTitle } from '@/lib/canvas-boxes';

const NOW = new Date('2026-10-23T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 3600_000;
const D = 24 * H;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const doc = (over: Partial<ClarityDoc> = {}): ClarityDoc =>
  ({ id: 'd1', title: 'My draft', visibility: 'private', updated_at: ago(2 * H), story_count: 2, point_count: 3, has_sent_letters: false, ...over }) as ClarityDoc;

const letter = (over: Record<string, unknown> = {}) =>
  ({ id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: ago(D), created_at: ago(D), doc_title: 'Sent letter', ...over }) as ArtifactsSource['sentLetters'][number];

const delivery = (over: Partial<LetterDelivery> = {}): LetterDelivery =>
  ({ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_profile_id: null, receiver_name: 'Ann', status: 'sent', read_at: null, ...over }) as LetterDelivery;

const inboxItem = (over: Partial<InboxItem> = {}): InboxItem => ({
  type: 'received', delivery_id: 'rd1', letter_id: 'rl1', title: 'From Mara', actor_name: 'Mara', actor_slug: 'mara',
  timestamp: ago(H), read_at: null, completed_at: null, ...over,
});

const myCanvas = (over: Partial<MyCanvasRow> = {}): MyCanvasRow => ({
  canvasId: null, name: 'sales_map', generalAccess: 'restricted', hasAudience: false, lastEdit: ago(3 * D), ...over,
});

const sharedCanvas = (over: Partial<CanvasSharedWithMe> = {}): CanvasSharedWithMe => ({
  canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null,
  via: 'person', viaName: null, sharedAt: ago(30 * 60_000), unread: true, ...over,
});

const source = (over: Partial<ArtifactsSource> = {}): ArtifactsSource => ({
  docs: [], sentLetters: [], deliveriesByLetter: {}, inbox: [], myCanvases: [], sharedCanvases: [], userSlug: 'me', userId: 'me-id', ...over,
});

describe('meta strings (Resolved Decisions: one line)', () => {
  it('agoPhrase reads relative times, "just now" and dates', () => {
    expect(agoPhrase(ago(2 * H))).toBe('2h ago');
    expect(agoPhrase(ago(10_000))).toBe('just now');
    expect(agoPhrase(ago(30 * D))).toMatch(/^on [A-Z][a-z]{2} \d{1,2}$/);
    expect(agoPhrase(null)).toBe('');
  });

  it('draft: "3 stories, 5 points · 2h ago" (the Drafts chip already says Draft)', () => {
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 3, points: 5 })).toBe('3 stories, 5 points · 2h ago');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 1, points: 1 })).toBe('1 story, 1 point · 2h ago');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 0, points: 0 })).toBe('0 stories, 0 points · 2h ago');
  });

  it('a draft already sent says how many letters it was used for, and still ends with the time', () => {
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 3, points: 5, sentCount: 2 })).toBe('3 stories, 5 points · used for 2 letters · 2h ago');
    expect(draftMeta({ updatedAt: ago(2 * H), stories: 1, points: 1, sentCount: 1 })).toBe('1 story, 1 point · used for 1 letter · 2h ago');
    expect(draftMeta({ updatedAt: ago(30 * D), stories: 1, points: 1, sentCount: 1 })).toMatch(/^1 story, 1 point · used for 1 letter · on [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('canvasTitle: underscores read as spaces and the first letter is capitalised', () => {
    expect(canvasTitle('hiring_plan_for_q1')).toBe('Hiring plan for q1');
    expect(canvasTitle('q4_roadmap_draft')).toBe('Q4 roadmap draft');
    expect(canvasTitle('Sales')).toBe('Sales');
    expect(canvasTitle('')).toBe('');
  });

  it('sent names who it went to: one or two in full, three or more as the first name + N others', () => {
    const meta = (recipientNames: string[], extra: Record<string, unknown> = {}) =>
      sentMeta({ isPublic: false, recipientNames, doneCount: 0, sealedAt: ago(2 * D), ...extra });
    expect(meta(['Anna Test'])).toBe('To Anna Test · 0 of 1 finished · 2d ago');
    expect(meta(['Anna Test', 'Tom Test'])).toBe('To Anna Test, Tom Test · 0 of 2 finished · 2d ago');
    expect(meta(['Tom Test', 'Anna Test', 'Bo Lee'])).toBe('To Tom Test + 2 others · 0 of 3 finished · 2d ago');
    expect(meta(['A', 'B', 'C', 'D', 'E'])).toBe('To A + 4 others · 0 of 5 finished · 2d ago');
    expect(meta([])).toBe('No recipients yet · 2d ago');
    expect(meta(['Anna Test', 'Tom Test'], { doneCount: 1 })).toBe('To Anna Test, Tom Test · 1 of 2 finished · 2d ago');
    expect(meta(['Anna Test'], { doneCount: 3 })).toBe('To Anna Test · 1 of 1 finished · 2d ago'); // never above the number of people
  });

  it('sent while something is new: "N new from X" takes the progress slot, the time still last', () => {
    expect(sentMeta({ isPublic: false, recipientNames: ['Anna Test', 'Tom Test'], doneCount: 1, newCount: 1, newFrom: ['Tom Test'], sealedAt: ago(H) }))
      .toBe('To Anna Test, Tom Test · 1 new from Tom Test · 1h ago');
    expect(sentMeta({ isPublic: false, recipientNames: ['Tom Test', 'A', 'B'], doneCount: 1, newCount: 3, newFrom: ['Tom Test', 'A'], sealedAt: ago(H) }))
      .toBe('To Tom Test + 2 others · 3 new from 2 people · 1h ago');
  });

  it('public link: "Public link · 4 finished · 2d ago"; while something is new "N new" takes the slot', () => {
    expect(sentMeta({ isPublic: true, recipientNames: [], doneCount: 4, sealedAt: ago(2 * D) })).toBe('Public link · 4 finished · 2d ago');
    expect(sentMeta({ isPublic: true, recipientNames: [], doneCount: 0, sealedAt: ago(2 * D) })).toBe('Public link · 0 finished · 2d ago');
    expect(sentMeta({ isPublic: true, recipientNames: [], doneCount: 4, newCount: 1, sealedAt: ago(2 * D) })).toBe('Public link · 1 new · 2d ago');
  });

  it('names are the full display name, however long ("Clarity Agent" is not "Clarity")', () => {
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Vyacheslav Ladischenski', steps_completed: 2, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Vyacheslav Ladischenski · 2 of 5 steps · 4d ago');
    expect(sharedMeta('Mara Jones', ago(H))).toBe('From Mara Jones · 1h ago');
    // no usable name: the fallback stays "someone"
    expect(receivedLetterMeta(inboxItem({ actor_name: '   ', timestamp: ago(4 * D) }))).toBe('From someone · 4d ago');
    expect(sharedMeta('', ago(H))).toBe('From someone · 1h ago');
  });

  it('when the person is the viewer, the meta line says "you"', () => {
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Me Myself', timestamp: ago(4 * D) }), true)).toBe('From you · 4d ago');
    expect(sharedMeta('Me Myself', ago(H), true)).toBe('From you · 1h ago');
    const { received } = buildArtifacts(source({
      userSlug: 'me',
      inbox: [inboxItem({ actor_name: 'Me Myself', actor_slug: 'me' }), inboxItem({ delivery_id: 'rd2', actor_name: 'Mara', actor_slug: 'mara' })],
    }));
    expect(received.map(r => r.meta).sort()).toEqual(['From Mara · 1h ago', 'From you · 1h ago']);
    const { shared } = buildArtifacts(source({ userId: 'me-id', sharedCanvases: [sharedCanvas({ ownerId: 'me-id', ownerName: 'Me Myself' })] }));
    expect(shared[0]?.meta).toBe('From you · 30m ago');
  });

  it('a sent letter names recipients in full, "you" for a delivery to the viewer', () => {
    const one = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Clarity Agent' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(one.sent[0]?.meta).toBe('To Clarity Agent · 1 new from Clarity Agent · 1h ago');
    const self = buildArtifacts(source({
      userId: 'me-id',
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Me Myself', receiver_profile_id: 'me-id' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(self.sent[0]?.meta).toBe('To you · 1 new from you · 1h ago');
    const many = buildArtifacts(source({
      userId: 'me-id',
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom Ash' }), delivery({ id: 'dv2', receiver_name: 'Me Myself', receiver_profile_id: 'me-id' }), delivery({ id: 'dv3', receiver_name: null, receiver_email: 'x@example.com' })] },
      newByDelivery: { dv1: 1, dv2: 1 },
    }));
    expect(many.sent[0]?.meta).toBe('To Tom Ash + 2 others · 2 new from 2 people · 1h ago');
    // a recipient with no name is shown by email
    const byEmail = buildArtifacts(source({ sentLetters: [letter()], deliveriesByLetter: { l1: [delivery({ receiver_name: null, receiver_email: 'x@example.com' })] } }));
    expect(byEmail.sent[0]?.meta).toMatch(/^To x@example\.com · /);
  });

  it('received: "From Tom · 2 of 5 steps · 4d ago" and "From Anna · Finished · 4d ago"', () => {
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Tom', steps_completed: 2, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Tom · 2 of 5 steps · 4d ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Anna', completed_at: ago(D), steps_completed: 5, total_steps: 5, timestamp: ago(4 * D) })))
      .toBe('From Anna · Finished · 4d ago');
    expect(receivedLetterMeta(inboxItem({ actor_name: 'Tom', timestamp: ago(4 * D) }))).toBe('From Tom · 4d ago');
  });

  it('canvas: "Edited 3d ago"; unknown edit says "Canvas"', () => {
    expect(canvasMeta(ago(3 * D))).toBe('Edited 3d ago');
    expect(canvasMeta(null)).toBe('Canvas');
  });

  it('shared: "From Mara · 1h ago"', () => {
    expect(sharedMeta('Mara', ago(H))).toBe('From Mara · 1h ago');
    expect(sharedMeta('Mara', ago(5_000))).toBe('From Mara · Just now');
    expect(sharedMeta(null, ago(H))).toBe('From someone · 1h ago');
  });

  it('rows never list recipients or say Sealed or replied', () => {
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ status: 'completed' })] },
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    for (const r of Object.values(lists).flat()) expect(r.meta).not.toMatch(/Sealed|recipients completed|replied/i);
  });
});

describe('partition of the inbox', () => {
  const sender = inboxItem({ type: 'recipient_responded', delivery_id: 'sd1', letter_id: 'l1', title: 'Sent letter', actor_name: 'Ann' });
  const progress = inboxItem({ type: 'recipient_in_progress', delivery_id: 'sd2', letter_id: 'l1' });
  const link = inboxItem({ type: 'link_respondent', delivery_id: 'sd3', letter_id: 'l1' });
  const received = inboxItem();

  it('splits received from sender-side activity', () => {
    const inbox = [received, sender, progress, link];
    expect(receivedInboxItems(inbox)).toEqual([received]);
    expect(senderActivityItems(inbox)).toEqual([sender, progress, link]);
  });

  it('sender-side activity never appears in Received', () => {
    const { received: rows } = buildArtifacts(source({ inbox: [received, sender, progress, link] }));
    expect(rows.map(r => r.ref.deliveryId)).toEqual(['rd1']);
  });

  it('sender-side activity joins onto the sent letter\'s "N of M done"', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter()],
      deliveriesByLetter: { l1: [delivery({ id: 'sd1' }), delivery({ id: 'x2' })] }, // deliveries lag: none completed yet
      // Read items: unread sender activity now counts as "new" (own tests below); this one pins the done join.
      inbox: [{ ...sender, read_at: ago(H) }, { ...progress, read_at: ago(H) }],
    }));
    expect(sent[0]?.meta).toBe('To Ann, Ann · 1 of 2 finished · 1d ago'); // only recipient_responded counts, "reading" does not
  });

  it('replied counts a delivery once when deliveries and inbox both report it', () => {
    const counts = repliedCountByLetter(
      { l1: [delivery({ id: 'sd1', status: 'completed' }), delivery({ id: 'sd9', status: 'in_progress' })] },
      [sender, link],
    );
    expect(counts).toEqual({ l1: 2 }); // sd1 (both sources) + sd3 (inbox link respondent)
  });

  it('inbox activity never lights the Received dot', () => {
    const { received: rows } = buildArtifacts(source({ inbox: [sender, progress, link] }));
    expect(listHasDot('received', rows)).toBe(false);
  });
});

describe('rows', () => {
  it('counts every delivery as a recipient: two Toms are two names', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Tom' })] },
      newByDelivery: { dv1: 1, dv2: 1 },
    }));
    expect(sent[0]?.meta).toBe('To Tom, Tom · 2 new from 2 people · 1h ago');
  });

  it('a recipient with no name is shown by their email', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: null })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(sent[0]?.meta).toBe('To a@example.com · 1 new from a@example.com · 1h ago');
  });

  it('a delivery the recipient finished and the sender has not read is new, and its time replaces sealed_at in text and sort', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed', completed_at: ago(10 * 60_000), read_at: null })] },
    }));
    expect(sent[0]?.state).toBe('sent');
    expect(sent[0]?.meta).toBe('To Tom · 1 new from Tom · 10m ago');
  });

  it('a recipient who has only started counts too (status in_progress, unread); one who has not started, or whose activity was read, does not', () => {
    const meta = (d: Partial<LetterDelivery>) => buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', created_at: ago(2 * H), ...d })] },
    })).sent[0]?.meta;
    expect(meta({ status: 'in_progress', read_at: null })).toBe('To Tom · 1 new from Tom · 2h ago');
    expect(meta({ status: 'sent', read_at: null })).toBe('To Tom · 0 of 1 finished · 3d ago');
    expect(meta({ status: 'opened', read_at: null })).toBe('To Tom · 0 of 1 finished · 3d ago');
    expect(meta({ status: 'completed', read_at: ago(H) })).toBe('To Tom · 1 of 1 finished · 3d ago');
    expect(meta({ status: 'in_progress', read_at: ago(H) })).toBe('To Tom · 0 of 1 finished · 3d ago');
  });

  it('a public-link respondent (no profile) with unread activity makes a public letter new', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ mode: 'one-to-many', sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_email: null, receiver_name: 'Visitor', receiver_profile_id: null, status: 'completed', completed_at: ago(H), read_at: null })] },
    }));
    expect(sent[0]?.meta).toBe('Public link · 1 new · 1h ago');
  });

  it('a delivery to the viewer themself is never "new" (the inbox RPC excludes it too)', () => {
    const { sent } = buildArtifacts(source({
      userId: 'me-id',
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_profile_id: 'me-id', status: 'completed', completed_at: ago(H), read_at: null })] },
    }));
    expect(sent[0]?.hasNew).toBe(false);
    expect(sent[0]?.meta).toBe('To you · 1 of 1 finished · 3d ago');
  });

  it('"new" comes from the deliveries alone: twenty newer received letters in the inbox cannot hide it, and neither can an empty inbox', () => {
    const flood = Array.from({ length: 20 }, (_, i) => inboxItem({ delivery_id: `r${i}`, letter_id: `rl${i}`, timestamp: ago(i * 1000) }));
    const base = {
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed', completed_at: ago(D), read_at: null })] },
    };
    for (const inbox of [flood, []]) {
      const { sent } = buildArtifacts(source({ ...base, inbox }));
      expect(sent[0]?.hasNew).toBe(true);
      expect(sent[0]?.meta).toBe('To Tom · 1 new from Tom · 1d ago');
    }
  });

  it('the sender\'s own seen mark decides: a recipient who opened the letter (read_at set) still shows later progress as new', () => {
    const meta = (d: Partial<LetterDelivery>) => buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'in_progress', read_at: ago(2 * D), ...d })] },
    })).sent[0]?.meta;
    // opened two days ago, progressed an hour ago, the sender never looked
    expect(meta({ last_progress_at: ago(H), sender_seen_at: null })).toBe('To Tom · 1 new from Tom · 1h ago');
    // the sender looked after the progress: nothing new
    expect(meta({ last_progress_at: ago(H), sender_seen_at: ago(10 * 60_000) })).toBe('To Tom · 0 of 1 finished · 3d ago');
    // the sender looked, then the recipient did more
    expect(meta({ last_progress_at: ago(10 * 60_000), sender_seen_at: ago(H) })).toBe('To Tom · 1 new from Tom · 10m ago');
  });

  it('a sent row carries what its buttons and its expansion need', () => {
    const d = delivery({ id: 'dv1', status: 'completed', completed_at: ago(H), last_progress_at: ago(H), sender_seen_at: null });
    const { sent, drafts } = buildArtifacts(source({
      docs: [doc({ id: 'd7', story_count: 0, has_sent_letters: true })],
      sentLetters: [letter({ id: 'l1', source_doc_id: 'd9', mode: 'one-to-many' })],
      deliveriesByLetter: { l1: [d] },
    }));
    expect(sent[0]?.ref).toMatchObject({ letterId: 'l1', sourceDocId: 'd9', isPublicLetter: true, newDeliveryIds: ['dv1'], deliveryCount: 1 });
    expect(sent[0]?.ref.deliveryCount).toBe(1);
    expect(drafts[0]?.ref).toMatchObject({ docId: 'd7', storyCount: 0, hasSentLetters: true });
    const { mine } = buildArtifacts(source({ myCanvases: [myCanvas({ generalAccess: 'link', hasAudience: true })] }));
    expect(mine[0]?.ref).toMatchObject({ canvasName: 'sales_map', generalAccess: 'link', hasAudience: true });
  });

  it('activity and explain-backs on one delivery are not double counted', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(3 * D) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom', status: 'completed', completed_at: ago(H), read_at: null })] },
      newByDelivery: { dv1: 2 },
    }));
    expect(sent[0]?.meta).toBe('To Tom · 2 new from Tom · 1h ago');
  });

  it('rows carry no "…" menu: a tap opens the item and the actions live inside it', () => {
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      myCanvases: [myCanvas()],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    const rows = Object.values(lists).flat();
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r).not.toHaveProperty('menu'); // the buttons are decided by the row component from the row's ref
  });

  it('new explain-backs show as "N new from <name>" on the sent letter', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [letter({ sealed_at: ago(H) })],
      deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' }), delivery({ id: 'dv2', receiver_name: 'Ann' })] },
      newByDelivery: { dv1: 1 },
    }));
    expect(sent[0]?.meta).toBe('To Tom, Ann · 1 new from Tom · 1h ago');
  });

  it('a draft counts the letters sent from it', () => {
    const { drafts } = buildArtifacts(source({
      docs: [doc({ id: 'd9', story_count: 3, point_count: 5, has_sent_letters: true })],
      sentLetters: [letter({ id: 'l1' }), letter({ id: 'l2' })],
    }));
    expect(drafts[0]?.meta).toBe('3 stories, 5 points · used for 2 letters · 2h ago');
  });

  it('Sent: letters with something new come first, newest activity first, then the rest newest first', () => {
    const { sent } = buildArtifacts(source({
      sentLetters: [
        letter({ id: 'quietNewer', doc_title: 'Quiet newer', sealed_at: ago(H) }),
        letter({ id: 'quietOlder', doc_title: 'Quiet older', sealed_at: ago(5 * D) }),
        letter({ id: 'newOld', doc_title: 'New but old letter', sealed_at: ago(30 * D) }),
        letter({ id: 'newRecent', doc_title: 'New recent activity', sealed_at: ago(20 * D) }),
      ],
      deliveriesByLetter: {
        newOld: [delivery({ id: 'dA', letter_id: 'newOld', receiver_name: 'Ann', status: 'completed', completed_at: ago(3 * D), read_at: null })],
        newRecent: [delivery({ id: 'dB', letter_id: 'newRecent', receiver_name: 'Bo', status: 'completed', completed_at: ago(10 * 60_000), read_at: null })],
      },
    }));
    expect(sent.map(r => r.title)).toEqual(['New recent activity', 'New but old letter', 'Quiet newer', 'Quiet older']);
    expect(sent.map(r => r.hasNew)).toEqual([true, true, false, false]);
    expect(sent.every(r => r.unread === false)).toBe(true); // still no row dot
    expect(sent[0]?.meta).toBe('To Bo · 1 new from Bo · 10m ago'); // the words stay
  });

  it('each kind lands in its own list, newest first inside it', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ id: 'dA', title: 'Older draft', updated_at: ago(5 * D) }), doc({ id: 'dB', title: 'Newer draft', updated_at: ago(H) })],
      sentLetters: [letter({ id: 'l1', doc_title: 'Sent letter', sealed_at: ago(2 * H) })],
      myCanvases: [myCanvas({ name: 'review_board', lastEdit: ago(30 * 60_000) }), myCanvas({ name: 'older_one', lastEdit: ago(3 * D) })],
      inbox: [inboxItem({ delivery_id: 'rA', title: 'Old', timestamp: ago(3 * D) }), inboxItem({ delivery_id: 'rB', title: 'New', timestamp: ago(H) })],
      sharedCanvases: [sharedCanvas({ canvasId: 'c1', sharedAt: ago(D) }), sharedCanvas({ canvasId: 'c2', name: 'newer_shared', sharedAt: ago(H) })],
    }));
    expect(lists.drafts.map(r => r.title)).toEqual(['Newer draft', 'Older draft']);
    expect(lists.sent.map(r => r.title)).toEqual(['Sent letter']);
    expect(lists.received.map(r => r.title)).toEqual(['New', 'Old']);
    expect(lists.mine.map(r => r.title)).toEqual(['Review board', 'Older one']);
    expect(lists.shared.map(r => r.title)).toEqual(['Newer shared', 'Q4 plan']);
    for (const list of Object.keys(lists) as ArtifactList[]) {
      expect(lists[list].every(r => r.list === list)).toBe(true);
    }
  });

  it('a draft that was already sent stays in Drafts; a public-link letter is in Sent', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ id: 'd9', title: 'Already sent', has_sent_letters: true })],
      sentLetters: [letter({ id: 'l2', source_doc_id: 'd9', doc_title: 'Public one', mode: 'one-to-many' })],
    }));
    expect(lists.drafts.map(r => r.title)).toEqual(['Already sent']);
    expect(lists.sent.map(r => r.title)).toEqual(['Public one']);
  });

  it('own items carry a visibility icon, received items none; unread only on received items', () => {
    const lists = buildArtifacts(source({
      docs: [doc({ visibility: 'public' })],
      sentLetters: [letter({ mode: 'one-to-many' })],
      myCanvases: [myCanvas({ generalAccess: 'link' }), myCanvas({ name: 'private_one' })],
      inbox: [inboxItem()],
      sharedCanvases: [sharedCanvas()],
    }));
    const own = [...lists.drafts, ...lists.sent, ...lists.mine];
    const incoming = [...lists.received, ...lists.shared];
    expect(own.map(r => r.visibility)).toEqual(expect.arrayContaining(['public', 'private']));
    expect(own.every(r => r.visibility !== null && r.unread === false)).toBe(true);
    expect(lists.mine.find(r => r.ref.canvasName === 'sales_map')?.visibility).toBe('public');
    expect(incoming.every(r => r.visibility === null)).toBe(true);
    expect(incoming.every(r => r.unread)).toBe(true);
  });

  it('row tap targets are the items\' existing pages: a draft edits, a sent letter opens its overview', () => {
    const lists = buildArtifacts(source({
      docs: [doc()],
      sentLetters: [letter()],
      myCanvases: [myCanvas()],
      inbox: [inboxItem(), inboxItem({ delivery_id: 'rd2', letter_id: 'rl2', completed_at: ago(H), read_at: ago(H) })],
      sharedCanvases: [sharedCanvas()],
    }));
    const hrefs = Object.fromEntries(Object.values(lists).flat().map(r => [r.key, r.href]));
    expect(hrefs['draft:d1']).toBe('/letters/drafts/d1');
    expect(hrefs['sent:l1']).toBe('/letter/l1/overview');
    expect(hrefs['canvas:sales_map']).toBe('/p/me/canvas/sales_map');
    expect(hrefs['received:rd1']).toBe('/letter/rd1');
    expect(hrefs['received:rd2']).toBe('/letter/rl2/results?delivery=rd2');
    expect(hrefs['shared-canvas:c1']).toBe('/p/tom/canvas/q4_plan');
  });

  it('a canvas address cannot be built without a handle', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas()], userSlug: null })).mine[0]?.href).toBeNull();
    expect(buildArtifacts(source({ sharedCanvases: [sharedCanvas({ ownerSlug: null })] })).shared[0]?.href).toBeNull();
  });

  it('canvas titles read underscores as spaces and start with a capital', () => {
    expect(buildArtifacts(source({ myCanvases: [myCanvas({ name: 'sales_map' })] })).mine[0]?.title).toBe('Sales map');
  });
});

describe('search', () => {
  const { drafts } = buildArtifacts(source({
    docs: [doc({ id: 'a', title: 'Quarterly Review' }), doc({ id: 'b', title: 'Review notes' }), doc({ id: 'c', title: 'Other' })],
  }));

  it('search is a case-insensitive title match, trimmed', () => {
    expect(filterByQuery(drafts, '  REVIEW ').map(r => r.title).sort()).toEqual(['Quarterly Review', 'Review notes']);
    expect(filterByQuery(drafts, '')).toHaveLength(3);
    expect(filterByQuery(drafts, 'nothing like it')).toEqual([]);
  });

  it('search matches titles only, not the meta line', () => {
    expect(filterByQuery(drafts, 'draft')).toEqual([]);
  });
});

describe('dots (Received and Shared with me while unread, Sent while new, tab when a list has one)', () => {
  const unreadReceived = inboxItem();
  const readReceived = inboxItem({ delivery_id: 'rd2', read_at: ago(H) });
  const newSent = {
    sentLetters: [letter({ sealed_at: ago(H) })],
    deliveriesByLetter: { l1: [delivery({ id: 'dv1', receiver_name: 'Tom' })] },
    newByDelivery: { dv1: 1 },
  };

  it('Received and Shared with me carry a dot while any row is unread, and not when all are read', () => {
    const unread = buildArtifacts(source({ inbox: [unreadReceived, readReceived], sharedCanvases: [sharedCanvas()] }));
    expect(listHasDot('received', unread.received)).toBe(true);
    expect(listHasDot('shared', unread.shared)).toBe(true);
    const read = buildArtifacts(source({ inbox: [readReceived], sharedCanvases: [sharedCanvas({ unread: false })] }));
    expect(listHasDot('received', read.received)).toBe(false);
    expect(listHasDot('shared', read.shared)).toBe(false);
  });

  it('items opened on the page stop counting at once', () => {
    const { received } = buildArtifacts(source({ inbox: [unreadReceived, readReceived] }));
    expect(listHasDot('received', received, new Set(['received:rd1']))).toBe(false);
  });

  it('Sent carries a dot while any sent letter has something new; the row says it in words', () => {
    const withNew = buildArtifacts(source(newSent));
    expect(withNew.sent[0]?.meta).toBe('To Tom · 1 new from Tom · 1h ago');
    expect(withNew.sent[0]?.unread).toBe(false); // the row itself never gets the unread dot
    expect(listHasDot('sent', withNew.sent)).toBe(true);
    const quiet = buildArtifacts(source({ ...newSent, newByDelivery: {} }));
    expect(listHasDot('sent', quiet.sent)).toBe(false);
  });

  it('Drafts, Mine never carry a dot', () => {
    const lists = buildArtifacts(source({ docs: [doc()], myCanvases: [myCanvas()] }));
    expect(listHasDot('drafts', lists.drafts)).toBe(false);
    expect(listHasDot('mine', lists.mine)).toBe(false);
  });

  it('a tab carries a dot when one of its lists does', () => {
    const letters = buildArtifacts(source({ inbox: [unreadReceived] }));
    expect(tabHasDot('letters', letters)).toBe(true);
    expect(tabHasDot('canvases', letters)).toBe(false);
    const canvases = buildArtifacts(source({ sharedCanvases: [sharedCanvas()] }));
    expect(tabHasDot('canvases', canvases)).toBe(true);
    expect(tabHasDot('letters', canvases)).toBe(false);
    const viaSent = buildArtifacts(source(newSent));
    expect(tabHasDot('letters', viaSent)).toBe(true);
    // the opened override reaches the tab too
    expect(tabHasDot('letters', letters, new Set(['received:rd1']))).toBe(false);
    expect(tabHasDot('letters', buildArtifacts(source()))).toBe(false);
  });
});

describe('url state', () => {
  const loc = (qs: string) => resolveArtifactsLocation(new URLSearchParams(qs));

  it('tab defaults to letters and the list to the tab\'s first; junk falls back', () => {
    expect(loc('')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: false });
    expect(loc('tab=letters&list=sent')).toMatchObject({ tab: 'letters', list: 'sent', legacy: false });
    expect(loc('tab=letters&list=received')).toMatchObject({ tab: 'letters', list: 'received' });
    expect(loc('tab=canvases')).toMatchObject({ tab: 'canvases', list: 'mine' });
    expect(loc('tab=canvases&list=shared')).toMatchObject({ tab: 'canvases', list: 'shared' });
    // a list that belongs to the other tab, or junk, falls back to the tab's default
    expect(loc('tab=letters&list=mine')).toMatchObject({ tab: 'letters', list: 'drafts' });
    expect(loc('tab=canvases&list=drafts')).toMatchObject({ tab: 'canvases', list: 'mine' });
    expect(loc('tab=nonsense&list=toString')).toMatchObject({ tab: 'letters', list: 'drafts', legacy: false });
  });

  it.each([
    ['tab=yours', 'letters', 'drafts'],
    ['tab=yours&type=letters', 'letters', 'drafts'],
    ['tab=yours&type=all', 'letters', 'drafts'],
    ['tab=yours&type=canvases', 'canvases', 'mine'],
    ['tab=shared', 'letters', 'received'],
    ['tab=shared&type=letters', 'letters', 'received'],
    ['tab=shared&type=canvases', 'canvases', 'shared'],
    ['type=canvases', 'canvases', 'mine'],
    ['type=letters', 'letters', 'drafts'],
  ])('old link ?%s opens %s / %s and is flagged for a history-replacing rewrite', (qs, tab, list) => {
    const r = loc(qs);
    expect(r).toMatchObject({ tab, list, legacy: true });
    expect(r.canonical.get('tab')).toBe(tab);
    expect(r.canonical.get('list')).toBe(list);
    expect(r.canonical.has('type')).toBe(false);
  });

  it('the rewrite keeps unrelated params', () => {
    expect(loc('tab=shared&type=canvases&x=1').canonical.get('x')).toBe('1');
  });

  it('a stray type on a new-style link is ignored, not rewritten', () => {
    expect(loc('tab=canvases&type=letters')).toMatchObject({ tab: 'canvases', list: 'mine', legacy: false });
  });
});
