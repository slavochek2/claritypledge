/**
 * @file letter-snapshot-mapper.ts
 * @description P673: Maps LetterStorySnapshot → StoryWithPoints for /live component reuse.
 *
 * SECURITY CONSTRAINTS (from architecture review):
 * 1. All data sourced from point_config only — no DB queries
 * 2. positionCounts set to empty objects — never expose community aggregate data
 * 3. Hidden points filtered from output
 */

import { normalizeVideoQuotes, type StoryVideoQuotesData } from '@/lib/video';
import type { LetterStorySnapshot, StoryWithPoints, PointSummary, PositionType, ContentVisibility, StoryVisibility, DocStory } from '@/app/types';
import type { Point, PositionEntry } from '@/app/components/shared/prototype-types';

interface PointConfigPoint {
  id: string;
  text: string;
  authorPosition: string | null;
  hidden?: boolean;
  visibility?: string;
}

interface PointConfig {
  storyText?: string;
  storyTitle?: string;
  imageUrl?: string;
  /**
   * P1141: the story's video reference, sealed alongside the image rather than
   * replacing it. ABSENT on every letter sealed before P1141 — and absent is
   * the CORRECT value there, not a gap: those stories legitimately have no
   * video, so the reader falls through to imageUrl and the letter renders
   * identically to how it did before this change.
   */
  videoUrl?: string;
  /** P1141: `{ quotes: { text, seconds }[], durationSeconds }`. Absent on pre-P1141 letters. */
  videoQuotes?: StoryVideoQuotesData;
  /**
   * P1212 §4b: the STORY's own author id — `stories.author_id`, sealed alongside the
   * text it wrote.
   *
   * Nothing in the snapshot identified the story's author before this. The letter
   * surface therefore derived its byline from the caller-supplied `authorName`, which
   * is the letter's SENDER (`story-walk.tsx:95-96`: "Author of the story = sender").
   * That is sound for a sender's own stories — the only ones `doc_stories` INSERT lets
   * them attach (`p551_clarity_docs.sql:92-105`) — but it means the surface cannot tell
   * a machine-authored reading from a human's, so it rendered every story as a human's.
   * A service-role write, which the disagreement pipeline uses, bypasses that RLS
   * entirely.
   *
   * ABSENT on every letter sealed before this field. Absent reads as "not an agent",
   * which renders the letter exactly as it rendered before — a guess is the one thing
   * this must not do, because the guess would attribute machine-written prose to a
   * named human.
   */
  storyAuthorId?: string;
  points?: PointConfigPoint[];
  hidden?: string[];
  order?: string[];
  /** P898: pre/post-story split — read via getEffectiveLeadCount (clamped; absent → 1) */
  lead_count?: number;
  /**
   * P1030: the story's experience belongs to the READER, not the sender — the sender
   * paraphrased something the reader lived. Read via isReverseStorySnapshot.
   *
   * Written onto the sealed snapshot by `/align-create-letter` (service role) after
   * `seal_and_send_letter` returns; there is no column behind it and no client path
   * can set it. Absent on every ordinary letter, which renders unchanged.
   */
  reverseStory?: boolean;
}

/**
 * Convert a PointSummary (from snapshotToStoryWithPoints output) into the
 * Point shape that PointCardWithLinks expects.
 *
 * @param point - The PointSummary to convert
 * @param receiverPosition - Optional position to inject for the '__receiver__' user
 */
export function pointSummaryToProtoPoint(
  point: PointSummary,
  receiverPosition?: PositionType | null
): Point {
  const positions: Record<string, PositionEntry | null> = {};
  if (receiverPosition) {
    positions['__receiver__'] = { position: receiverPosition, timestamp: '' };
  }
  return {
    id: point.id,
    text: point.statement,
    createdAt: '',
    positions,
    linkedStoryIds: [],
    visibility: point.visibility,
  };
}

interface AuthorProfile {
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  role?: string;
  earsCount?: number;
  hasPledged?: boolean;
}

/**
 * P705: Post-process a StoryWithPoints to inject the viewer's own live positions
 * from point_positions into userPosition on each point.
 *
 * The base snapshotToStoryWithPoints() hardcodes userPosition: null.
 * This injector overwrites it with live data from a Map<pointId, PositionType>.
 * Creates a new StoryWithPoints (no in-place mutation).
 */
export function injectUserPositions(
  story: StoryWithPoints,
  positionMap: Map<string, PositionType>
): StoryWithPoints {
  return {
    ...story,
    points: story.points.map(point => ({
      ...point,
      userPosition: positionMap.get(point.id) ?? null,
    })),
  };
}

/**
 * P699: Post-process a StoryWithPoints to inject the other party's positions
 * into profileSubjectPosition on each point.
 *
 * snapshotToStoryWithPoints() maps authorPosition → profileSubjectPosition.
 * For sender perspective in the story walk, we want receiver positions there instead.
 * Creates a new StoryWithPoints (no in-place mutation).
 */
export function injectReceiverPositions(
  story: StoryWithPoints,
  positionMap: Map<string, PositionType>
): StoryWithPoints {
  return {
    ...story,
    points: story.points.map(point => ({
      ...point,
      profileSubjectPosition: positionMap.get(point.id) ?? null,
      // P705: userPosition intentionally not touched — injectUserPositions owns that field.
      // Nulling it here would create call-order dependency with injectUserPositions.
    })),
  };
}

/**
 * Convert a LetterStorySnapshot into the StoryWithPoints shape
 * that LiveStoryCardExpanded expects.
 *
 * Filters hidden points and zeros out positionCounts for security.
 */
export function snapshotToStoryWithPoints(
  snapshot: LetterStorySnapshot,
  author: AuthorProfile | string
): StoryWithPoints {
  // Support legacy string callers
  const authorProfile: AuthorProfile = typeof author === 'string' ? { name: author } : author;
  const config = (snapshot.point_config ?? {}) as PointConfig;
  const rawPoints = Array.isArray(config.points) ? config.points : [];
  const topLevelHidden = Array.isArray(config.hidden) ? new Set(config.hidden) : null;

  // Filter hidden points — they must not appear in the UI or count for anti-point lead.
  // Two source shapes are honored:
  //   per-point boolean (`p.hidden`) — written by the post-fix preview builder + future seal RPCs
  //   top-level id array (`config.hidden`) — written by the seal RPC for already-sealed letters
  // NOTE (P843): `superseded_by` is intentionally NOT filtered here. A sealed
  // letter freezes the point set at delivery time — the mapper has no DB access
  // and that's by design. The sender's overview (`get_letter_overview`) also
  // does NOT filter superseded points; both views must show what each recipient
  // actually saw. See docs/decisions.md 2026-05-17 entry for the reasoning.
  const visiblePoints: PointSummary[] = rawPoints
    .filter((p) => !p.hidden && !(topLevelHidden && p.id && topLevelHidden.has(p.id)))
    .map((p) => ({
      id: p.id ?? '',
      statement: p.text ?? '',
      tags: [],
      systemTags: [],
      positionCounts: {},       // SECURITY: never expose community counts
      userPosition: null,
      profileSubjectPosition: (p.authorPosition as PointSummary['profileSubjectPosition']) ?? null,
      visibility: ((p.visibility || snapshot.visibility || 'public') as ContentVisibility),
    }));

  if (Array.isArray(config.order) && config.order.length > 0) {
    const orderMap = new Map(config.order.map((id, i) => [id, i]));
    // Unlisted points tail in their original insertion order — relies on stable sort (V8/Node 11+, all modern browsers).
    visiblePoints.sort((a, b) => {
      const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }

  return {
    id: snapshot.story_id,
    // P1212 §4b: the story's own author, when the snapshot carries it. Empty on letters
    // sealed before that field existed — read as "not an agent", never guessed from the
    // name, which belongs to the sender.
    authorId: config.storyAuthorId ?? '',
    content: config.storyText ?? '',
    imageUrl: config.imageUrl || undefined,
    videoUrl: config.videoUrl || undefined,
    videoQuotes: normalizeVideoQuotes(config.videoQuotes),
    visibility: (snapshot.visibility === 'private' ? 'private' : 'public') as StoryVisibility,
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '',
    updatedAt: '',
    tags: [],
    systemTags: [],
    authorName: authorProfile.name,
    authorSlug: '',
    authorAvatarUrl: authorProfile.avatarUrl,
    authorAvatarColor: authorProfile.avatarColor,
    authorRole: authorProfile.role,
    authorEarsCount: authorProfile.earsCount ?? 0,
    authorHasPledged: authorProfile.hasPledged ?? false,
    points: visiblePoints,
  };
}

/**
 * Convert a DocStory (live doc state) into a LetterStorySnapshot for the preview path.
 *
 * Co-located with snapshotToStoryWithPoints so the snapshot shape stays consistent
 * across the builder (preview) and reader (sealed letter) — the original shape drift
 * between the two was the root cause of P749 (hidden points leaked into preview).
 *
 * Populates per-point `hidden` from `docStory.point_config.hidden`, allowing the reader's
 * existing per-point filter to fire without any preview-specific code path.
 */
export function docStoryToSnapshot(docStory: DocStory): LetterStorySnapshot {
  const hiddenIds = Array.isArray(docStory.point_config?.hidden)
    ? new Set(docStory.point_config.hidden)
    : null;
  return {
    letter_id: '',
    story_id: docStory.story_id,
    version_id: '',
    position: docStory.position,
    point_config: {
      storyText: docStory.story.content,
      storyTitle: docStory.story.title ?? '',
      imageUrl: docStory.story.imageUrl,
      videoUrl: docStory.story.videoUrl,
      videoQuotes: docStory.story.videoQuotes,
      // P1212 §4b: preview path mirrors what the seal RPC writes, so the builder and the
      // reader agree on the shape — the drift between them was the root cause of P749.
      storyAuthorId: docStory.story.authorId || undefined,
      points: docStory.story.points.map((p) => ({
        id: p.id,
        text: p.statement,
        authorPosition: p.userPosition ?? null,
        visibility: p.visibility,
        hidden: hiddenIds ? hiddenIds.has(p.id) : false,
      })),
      order: Array.isArray(docStory.point_config?.order) ? docStory.point_config.order : undefined,
      // P898: carry the pre/post-story split so preview matches the sealed walk
      lead_count:
        typeof docStory.point_config?.lead_count === 'number'
          ? docStory.point_config.lead_count
          : undefined,
    },
    visibility: docStory.story.visibility ?? 'public',
  };
}
