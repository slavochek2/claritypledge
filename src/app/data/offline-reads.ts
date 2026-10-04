/**
 * @file offline-reads.ts
 * @description P1369 Scope v2: the offline-readable reads that BOTH a page and the offline pack
 * perform — one definition of the resource key and the fetch, so a pre-loaded entry is found by
 * exactly the read the page does (a key that differed by one character would pre-load something
 * no page ever reads).
 *
 * Each entry is `{ type, id, fetch }`: pages pass it to `readThrough`, the offline pack to
 * `prefetchThrough`. The owner (auth context) is added by the cache itself.
 */
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { organizationsService } from '@/app/data/organizations-service';
import { eventsService } from '@/app/data/events-service';
import { STANDARD_STAKE_TAGS } from '@/app/data/event-links';
import type { OfflineResourceType, ReadOptions } from '@/lib/offline-read-cache';
import type { EventWithHost, PointWithUserPosition, StoryWithAuthor } from '@/app/types';
import type { Organization, OrgEventSummary, OrgParticipation } from '@/app/data/organizations-service.interface';

export interface OfflineRead<T> {
  type: OfflineResourceType;
  id: string;
  fetch: () => Promise<T | null>;
  /**
   * For a fetch whose result depends on the React auth user (their own positions): who it was
   * fetched for. Pass to readThrough / prefetchThrough. The id never contains the viewer — the
   * cache owner (the stored session) already partitions it, and the React user is null until the
   * profile loads (never, offline), which made the offline read miss (P1369 review R5).
   */
  options?: Pick<ReadOptions, 'viewerId'>;
}

// ─── /stake/:tag ─────────────────────────────────────────────────────────────

export const STAKE_LIMIT = 50;

/** Zero-position points stay listed only on the standing instruments (see stake-page.tsx). */
export const keepsUnstaked = (t: string) => (STANDARD_STAKE_TAGS as readonly string[]).includes(t);

export interface StakeRows {
  points: PointWithUserPosition[];
  stories: StoryWithAuthor[];
}

export function stakeRead(tag: string, viewerUserId: string | undefined): OfflineRead<StakeRows> {
  return {
    type: 'stake',
    id: tag,
    options: { viewerId: viewerUserId ?? null },
    fetch: async () => {
      // ascending = true — oldest-first from the DB (stake-page.tsx ORDERING).
      const [points, stories] = await Promise.all([
        pointsService.getPublicPointsFeed(STAKE_LIMIT, 0, tag, viewerUserId, true, keepsUnstaked(tag), true), // P1376: current versions only
        storiesService.getPublicStoriesFeed(STAKE_LIMIT, 0, tag, true),
      ]);
      return { points, stories };
    },
  };
}

// ─── /feed ───────────────────────────────────────────────────────────────────

export const FEED_LIMIT = 50;

export interface FeedRows {
  stories: StoryWithAuthor[];
  points: PointWithUserPosition[];
  cloudStories: StoryWithAuthor[];
  cloudPoints: PointWithUserPosition[];
}

/** The feed's first page for one tag filter (or none) and sort. */
export function feedRead(
  viewerUserId: string | undefined,
  ascending: boolean,
  tagFilter: string | undefined,
): OfflineRead<FeedRows> {
  return {
    type: 'feed',
    id: `${ascending ? 'asc' : 'desc'}:${tagFilter ?? ''}`,
    options: { viewerId: viewerUserId ?? null },
    fetch: async () => {
      if (tagFilter) {
        const [stories, points, cloudStories, cloudPoints] = await Promise.all([
          storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, tagFilter, ascending),
          pointsService.getPublicPointsFeed(FEED_LIMIT, 0, tagFilter, viewerUserId, ascending),
          storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending),
          pointsService.getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending),
        ]);
        return { stories, points, cloudStories, cloudPoints };
      }
      const [stories, points] = await Promise.all([
        storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending),
        pointsService.getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending),
      ]);
      return { stories, points, cloudStories: stories, cloudPoints: points };
    },
  };
}

// ─── /groups ─────────────────────────────────────────────────────────────────

export interface GroupsDirectory {
  orgs: Organization[];
  memberCounts: Record<string, number> | null;
  participation: Record<string, OrgParticipation>;
  myOrgIds: string[];
  eventSummaries: Record<string, OrgEventSummary>;
}

/** The /groups directory. The viewer (their memberships) is already the cache owner. */
export function groupsRead(): OfflineRead<GroupsDirectory> {
  return {
    type: 'groups',
    id: 'directory',
    fetch: async () => {
      const orgs = await organizationsService.listPublicOrganizations();
      const ids = orgs.map((o) => o.id);
      // Each side-read degrades to absent on its own failure (org-directory-page.tsx).
      const [memberCounts, participation, myOrgIds, eventSummaries] = await Promise.all([
        organizationsService.getMemberCounts(ids).catch(() => null),
        organizationsService.getParticipation(ids).catch(() => ({})),
        organizationsService.getMyMembershipOrgIds().catch(() => [] as string[]),
        organizationsService.getEventSummaries(ids).catch(() => ({})),
      ]);
      return { orgs, memberCounts, participation, myOrgIds, eventSummaries };
    },
  };
}

// ─── / (home: groups + next events) ──────────────────────────────────────────

export const HOME_MAX_GROUPS = 2;

export interface HomeHighlights {
  groups: Organization[];
  /** Upcoming events of those groups, unfiltered by time: the reader drops started ones at
   *  render, so a saved copy never shows a past event as "next". */
  events: EventWithHost[];
}

/** P1407: the home page's groups and their upcoming events, readable offline. */
export function homeRead(): OfflineRead<HomeHighlights> {
  return {
    type: 'home',
    id: 'highlights',
    fetch: async () => {
      const groups = (await organizationsService.listPublicOrganizations()).slice(0, HOME_MAX_GROUPS);
      // "Our next event" = the next event of OUR groups (review, P1401): an unscoped query would
      // let any account's event become the one featured here.
      const perGroup = await Promise.all(groups.map((o) => eventsService.getUpcomingEvents(o.id).catch(() => [])));
      return { groups, events: perGroup.flat() };
    },
  };
}

// Letters: offline-reads-letters.ts (kept apart so the app shell can import it without pulling
// in the list services).
