/**
 * @file letter-preload.ts
 * @description P827 — module-level helpers for letter-sourced /live preload.
 *
 * Extracted from clarity-live-page.tsx so that both entry-from-letter (P733
 * bootstrap) and picker-sourced story switch (P827 handleSelectStory) write
 * byte-identical live_state. Sharing one composer prevents drift between the
 * two call sites.
 *
 * Decision 3 (P827 spec): letter direction is authoritative. The letter sender
 * becomes the /live speaker (checker); the receiver is the listener (responder).
 * `creatorIsLetterSender` flips which side of the live_state gets which rating.
 */

import {
  type LiveSessionState,
  type LiveStoryData,
  type PositionType,
  type StoryWithPoints,
  DEFAULT_LIVE_STATE,
} from '@/app/types';

// Convert a Map<pointId, { position }> to a plain Record for live_state JSONB.
export function toPositionRecord(
  map: Map<string, { position: PositionType }>,
): Record<string, PositionType> {
  return Object.fromEntries([...map.entries()].map(([id, v]) => [id, v.position]));
}

// Project StoryWithPoints into the live_state LiveStoryData snapshot. Shared
// by bootstrap (P733) and picker (P792/P827) so both paths produce the same
// shape — drift would corrupt the listener's render of the story card.
export function toLiveStoryData(storyData: StoryWithPoints): LiveStoryData {
  return {
    id: storyData.id,
    authorId: storyData.authorId,
    content: storyData.content,
    points: storyData.points.map(p => ({
      id: p.id,
      statement: p.statement,
      tags: p.tags,
      systemTags: p.systemTags,
      positionCounts: p.positionCounts,
      userPosition: p.userPosition,
      profileSubjectPosition: p.profileSubjectPosition,
      visibility: p.visibility,
    })),
    authorName: storyData.authorName,
    authorSlug: storyData.authorSlug,
    authorAvatarColor: storyData.authorAvatarColor,
    authorAvatarUrl: storyData.authorAvatarUrl,
    authorRole: storyData.authorRole,
    authorEarsCount: storyData.authorEarsCount,
    authorHasPledged: storyData.authorHasPledged,
    visibility: storyData.visibility,
    createdAt: storyData.createdAt,
  };
}

export function composeLetterPreloadState(input: {
  ratings: { speakerRating: number | null; listenerRating: number | null };
  liveStoryData: LiveStoryData;
  storyTitle: string;
  creatorIsLetterSender: boolean;
  creatorName: string;
  joinerName: string;
  creatorPositions: Record<string, PositionType | null>;
  joinerPositions: Record<string, PositionType | null>;
  ratingInitiatedBy: string;
  ratingInitiatedByIsCreator: boolean;
}): LiveSessionState {
  const {
    ratings,
    liveStoryData,
    storyTitle,
    creatorIsLetterSender,
    creatorName,
    joinerName,
    creatorPositions,
    joinerPositions,
    ratingInitiatedBy,
    ratingInitiatedByIsCreator,
  } = input;

  const checkerIsCreator = creatorIsLetterSender;
  const checkerName = creatorIsLetterSender ? creatorName : joinerName;
  const checkerRating = creatorIsLetterSender
    ? ratings.speakerRating ?? undefined
    : ratings.listenerRating ?? undefined;
  const responderRating = creatorIsLetterSender
    ? ratings.listenerRating ?? undefined
    : ratings.speakerRating ?? undefined;

  return {
    ...DEFAULT_LIVE_STATE,
    ratingPhase: 'explain-back',
    checkerName,
    checkerIsCreator,
    checkerRating,
    responderRating,
    checkerSubmitted: true,
    responderSubmitted: true,
    selectedStoryId: liveStoryData.id,
    selectedStoryData: liveStoryData,
    selectedContentTitle: storyTitle,
    ratingInitiatedBy,
    ratingInitiatedByIsCreator,
    livePositionsCreator: creatorPositions,
    livePositionsJoiner: joinerPositions,
  };
}
