/**
 * P1631: every sentence of the Clarify thread. The first group is enumerated by the spec; the second is new and awaits the founder.
 */
// Enumerated by the spec / design contract.
export const CLARIFY_TITLE = 'Your Mirror';
export const CLARIFY_SUBTITLE = 'Only you see this';
export const DRAFT_PILL = 'Draft';

// [FOUNDER DECISION: copy] the spec says cited lines are "marked as possibly wrong" but gives no wording: a neutral placeholder, awaiting approval.
export const CITED_LEAD = 'From the conversation (possibly wrong):';

// [FOUNDER DECISION: copy] thread redesign (2026-11-11), awaiting approval.
export const UPDATED_LEAD = 'Updated:';
export const EARLIER_LABEL = 'Earlier version';
export const PUBLISH_LABEL = 'Publish to chat';
/** In the Mirror there is no one to publish to. */
export const PUBLISH_MIRROR_LABEL = 'Publish';
export const PUBLISH_NEEDS_POSITION_TOAST = 'Set your position first';
export const PUBLISH_PUBLISHED_TEXT = 'Published';
export const PUBLISH_NOT_AVAILABLE_TOAST = 'You can no longer post in this chat';
export const ANOTHER_POINT_LABEL = 'Another point';
export const CLARIFY_LABEL = 'Clarify';
// [FOUNDER DECISION: copy] settled by the founder (spec Open Question 13): the extra choice on a refusal; also the instruction it sends
// The visible label only: free to reword. What the button SENDS is MAKE_ANYWAY_INSTRUCTION below.
export const MAKE_ANYWAY_LABEL = 'Make one anyway';
// The instruction sent to the model: it must match the phrase the drafting adapter keys on (supabase/functions/clarify-draft/clarify-adapter.md). Never derive it from the label.
export const MAKE_ANYWAY_INSTRUCTION = 'Make one anyway';

// [FOUNDER DECISION: copy] new in P1631, not in the spec.
export const RETRY_LABEL = 'Try again';
export const EMPTY_DRAFT_TEXT = 'A point needs some words.';
export const SAVE_FAILED_TEXT = 'Could not save this point. Try again.';
export const DELETE_TITLE = 'Delete this draft?';
export const DELETE_DESCRIPTION = 'It is removed from your Mirror.';
export const NO_SPLIT_TEXT = "I don't see another disagreement in this message. Want one of these instead?";
export const FAILED_TEXT = "Couldn't make a point";
export const CAPPED_TEXT = 'Out of drafts for today. Try again tomorrow.';
export const CLARIFY_FAILED_TOAST = 'Could not start Clarify. Try again.';
export const LOAD_FAILED_TEXT = 'Could not load your drafts.';
export const DELETE_FAILED_TEXT = 'Could not delete this draft. Try again.';
export const CLARIFY_COMPOSER_HINT = 'Tell the Mirror what to change';
export const CLARIFY_WAITING_TEXT = 'Drafting…';
export const CLARIFY_TOO_LONG_TOAST = 'Keep it under 500 characters.';
/** A voice instruction with no words in it (the chat's silent voice message says the same). */
export const CLARIFY_NO_SPEECH_TOAST = 'No speech in this recording';
// [FOUNDER DECISION: copy] shown when a message is refused because a draft is already being made
export const CLARIFY_BUSY_TOAST = 'A draft is already being made. Try again when it is done.';
// [FOUNDER DECISION: copy] the way into a Clarify thread that has no drafts and no replies (all deleted, or the count could not be read); the product's own thread wording
export const CLARIFY_EMPTY_THREAD_LABEL = 'Reply in thread';
// [FOUNDER DECISION: copy] Clarify on a chat row / New point (agent-proposed)
export const CLARIFY_NOTHING_YET_TOAST = 'Nothing to clarify yet';
export const NEW_POINT_LABEL = 'New point';
export const CLARIFY_NO_DRAFT_HINT = 'Say what the point is about';
export const chatScopeLine = (kind: string | null, title: string | null): string =>
  kind === 'dm' ? (title ? `Chat with ${title}` : 'Chat') : title ?? 'Chat';
// P1722: approved by the founder (spec UI Contract).
export const VISIBILITY_PRIVATE_LABEL = 'Private';
export const VISIBILITY_PUBLIC_LABEL = 'Public';
export const PUBLIC_WARNING_TITLE = 'Make this point public?';
export const PUBLIC_WARNING_CONFIRM = 'Make public';
export const PUBLIC_WARNING_KEEP = 'Keep private';
export const RECORDING_SOURCE_NAME = 'a recording';
export const publicWarningBody = (source: string): string =>
  `It came from ${source}. Anyone will be able to read it and take a position, and it can't be made private again. Check it doesn't share anything said in confidence.`;
/** Where the draft's words came from, for the warning: the source chat's own title, or "a recording" (the Mirror's case). */
export const warningSourceName = (sourceKind: string | null, chatTitle: string | null): string =>
  sourceKind === 'mirror' ? RECORDING_SOURCE_NAME : chatTitle?.trim() || 'this chat';
export const VISIBILITY_FAILED_TOAST = 'Could not change this. Try again.';
export const DRAFT_MAX = 300;
export const CLARIFY_MESSAGE_MAX = 500;
// P1722: plain-language answers to the new refusals of Publish and visibility.
export const PUBLISH_ANSWERED_TOAST = 'Someone already answered this point, so it can no longer change.';
export const PUBLISH_VISIBILITY_CHANGED_TOAST = 'The visibility changed. Check it and publish again.';
export const PUBLISH_NEEDS_WARNING_TOAST = 'Confirm that this point becomes public, then publish again.';
// A draft carries at most this many #tags (the server refuses more).
export const MAX_DRAFT_TAGS = 20;
export const TOO_MANY_TAGS_TEXT = 'Up to 20 tags. Remove a few #tags and save again.';
// A draft that only holds #tags has no point to save.
export const TAGS_ONLY_TEXT = 'A point needs some words besides the #tags.';
// The words behind this draft belong to a person who has since been erased: there is nothing to retry.
export const ERASED_TEXT = 'This draft can no longer be made: the person whose words it used was erased.';
// The point's words changed after the owner saw them: Publish stopped.
export const PUBLISH_CHANGED_TOAST = 'This point changed. Check it and publish again.';
