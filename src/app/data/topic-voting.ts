/**
 * @file topic-voting.ts
 * @description P1347: data + pure helpers for /topics (attendees rate next Clarity Night topics)
 * and the founder-only /admin/topics.
 *
 * Every read and write is an RPC; the three tables have no client policies at all
 * (migration 20261001180000_p1347_topic_voting.sql). Rating is anonymous and keyed on a
 * random per-device token, so counts are devices, not people. Suggestions need sign-in.
 * Admin functions are gated in Postgres by assert_admin(); nothing here decides who is
 * an admin.
 */
import { supabase } from '@/lib/supabase';

export interface OpenTopic {
  id: string;
  title: string;
  /** 'community' = added by an attendee; always listed above the host's ('host'). */
  source: 'host' | 'community';
  ratingAvg: number | null;
  ratingCount: number;
  score: number;
  myRating: number | null;
}

interface OpenTopicRow {
  id: string;
  title: string;
  source: 'host' | 'community';
  rating_avg: number | string | null;
  rating_count: number;
  score: number | string | null;
  my_rating: number | null;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

function mapOpenTopic(r: OpenTopicRow): OpenTopic {
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    ratingAvg: num(r.rating_avg),
    ratingCount: r.rating_count,
    score: num(r.score) ?? 0,
    myRating: r.my_rating,
  };
}

// ─── Per-device voter token ────────────────────────────────────────────────

const VOTER_KEY = 'cp.topicVoterToken';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One device = one voter. If storage is blocked (private mode), the token lives for
 * this page load only: the person can still rate, they just cannot see their own
 * earlier ratings after a reload.
 */
let memoryToken: string | null = null;
export function getVoterToken(): string {
  try {
    const stored = localStorage.getItem(VOTER_KEY);
    if (stored && UUID_RE.test(stored)) return stored;
    const fresh = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, fresh);
    return fresh;
  } catch {
    memoryToken ??= crypto.randomUUID();
    return memoryToken;
  }
}

// ─── Public ────────────────────────────────────────────────────────────────

export async function getOpenTopics(voterToken: string): Promise<OpenTopic[] | null> {
  const { data, error } = await supabase.rpc('get_open_topics', { p_voter_token: voterToken });
  if (error) {
    console.error('[topics] get_open_topics failed:', error.code, error.message);
    return null;
  }
  return ((data ?? []) as OpenTopicRow[]).map(mapOpenTopic);
}

export async function rateTopic(topicId: string, voterToken: string, rating: number): Promise<boolean> {
  const { error } = await supabase.rpc('rate_topic', {
    p_topic_id: topicId,
    p_voter_token: voterToken,
    p_rating: rating,
  });
  if (error) console.error('[topics] rate_topic failed:', error.code, error.message);
  return !error;
}

/**
 * Attendee topics first (founder rule: "suggestion by our people goes above mine"),
 * then most wanted by the same score the founder sees; ties keep the server order.
 * The server already returns this order; re-applied here so an optimistic tap and a
 * just-added topic sit where the next fetch will put them.
 */
export function rankTopics(topics: OpenTopic[]): OpenTopic[] {
  return topics
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        Number(b.t.source === 'community') - Number(a.t.source === 'community') ||
        b.t.score - a.t.score ||
        b.t.ratingCount - a.t.ratingCount ||
        a.i - b.i,
    )
    .map(({ t }) => t);
}

/** Signed-in only. Title goes public at once; note and link go to the host only. */
export async function addTopic(input: { title: string; note?: string; link?: string }): Promise<'ok' | 'limit' | 'error'> {
  const { error } = await supabase.rpc('add_topic', {
    p_title: input.title,
    p_note: input.note?.trim() || null,
    p_link: input.link?.trim() || null,
  });
  if (!error) return 'ok';
  console.error('[topics] add_topic failed:', error.code, error.message);
  return error.code === '54000' ? 'limit' : 'error';
}

/** A link field accepts only https URLs; blank is fine (it is optional). */
export function isValidOptionalLink(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  try {
    return new URL(s).protocol === 'https:' && s.length <= 500;
  } catch {
    return false;
  }
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface AdminTopic {
  id: string;
  title: string;
  source: 'host' | 'community';
  authorName: string | null;
  why: string | null;
  videoUrl: string | null;
  thinkerName: string | null;
  isPublished: boolean;
  sortOrder: number;
  ratingAvg: number | null;
  ratingCount: number;
  keenShare: number | null;
  score: number;
  suggestionCount: number;
}

export interface AdminTopicSuggestion {
  id: string;
  topicId: string | null;
  topicTitle: string | null;
  body: string;
  link: string | null;
  authorName: string | null;
  authorSlug: string | null;
  email: string | null;
  createdAt: string;
}

export async function getAdminTopics(): Promise<AdminTopic[] | null> {
  const { data, error } = await supabase.rpc('admin_list_topics');
  if (error) {
    console.error('[admin-topics] admin_list_topics failed:', error.code);
    return null;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    title: r.title as string,
    source: r.source as 'host' | 'community',
    authorName: (r.author_name as string | null) ?? null,
    why: (r.why as string | null) ?? null,
    videoUrl: (r.video_url as string | null) ?? null,
    thinkerName: (r.thinker_name as string | null) ?? null,
    isPublished: r.is_published as boolean,
    sortOrder: r.sort_order as number,
    ratingAvg: num(r.rating_avg as number | null),
    ratingCount: r.rating_count as number,
    keenShare: num(r.keen_share as number | null),
    score: num(r.score as number | null) ?? 0,
    suggestionCount: r.suggestion_count as number,
  }));
}

export async function getAdminTopicSuggestions(): Promise<AdminTopicSuggestion[] | null> {
  const { data, error } = await supabase.rpc('admin_list_topic_suggestions');
  if (error) {
    console.error('[admin-topics] admin_list_topic_suggestions failed:', error.code);
    return null;
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    topicId: (r.topic_id as string | null) ?? null,
    topicTitle: (r.topic_title as string | null) ?? null,
    body: r.body as string,
    link: (r.link as string | null) ?? null,
    authorName: (r.author_name as string | null) ?? null,
    authorSlug: (r.author_slug as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function saveAdminTopic(t: {
  id: string | null;
  title: string;
  why: string;
  videoUrl: string;
  thinkerName: string;
  sortOrder: number;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_save_topic', {
    p_id: t.id,
    p_title: t.title,
    // Optional fields: blank → NULL (the table CHECKs reject an empty string).
    p_why: t.why.trim() || null,
    p_video_url: t.videoUrl.trim() || null,
    p_thinker_name: t.thinkerName.trim() || null,
    p_sort_order: t.sortOrder,
  });
  if (error) {
    console.error('[admin-topics] admin_save_topic failed:', error.code, error.message);
    return null;
  }
  return data as string;
}

export async function setAdminTopicPublished(id: string, published: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_topic_published', { p_id: id, p_published: published });
  if (error) console.error('[admin-topics] admin_set_topic_published failed:', error.code);
  return !error;
}
