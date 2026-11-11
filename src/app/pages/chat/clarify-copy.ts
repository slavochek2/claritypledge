/**
 * P1631: every sentence of the Clarify thread. The first group is enumerated by the spec; the second is new and awaits the founder.
 */
// Enumerated by the spec / design contract.
export const CLARIFY_TITLE = 'Your Mirror';
export const CLARIFY_SUBTITLE = 'Only you see this';
export const DRAFT_PILL = 'Draft';
// The source here is always a chat message, never a live transcript, so the label is plain: the client cannot tell the two apart yet.
export const CITED_LABEL = 'Cited lines';
/** "▸ N cited": the card's toggle. */
export const citedToggleLabel = (n: number): string => `${n} cited`;

// [FOUNDER DECISION: copy] thread redesign (2026-11-11), awaiting approval.
export const UPDATED_LEAD = 'Updated:';
export const EARLIER_LABEL = 'Earlier version';
export const POSITION_LABEL = 'Your position';
export const PUBLISH_LABEL = 'Publish to chat';
export const PUBLISH_NEEDS_POSITION_TOAST = 'Set your position first';
export const PUBLISH_COMING_TOAST = 'Publishing comes next';
export const ANOTHER_POINT_LABEL = 'Another point';
export const CLARIFY_LABEL = 'Clarify';

// [FOUNDER DECISION: copy] new in P1631, not in the spec.
export const RETRY_LABEL = 'Try again';
export const DRAFT_PRIVATE_LABEL = 'Private';
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
// [FOUNDER DECISION: copy] shown when a message is refused because a draft is already being made
export const CLARIFY_BUSY_TOAST = 'A draft is already being made. Try again when it is done.';
// [FOUNDER DECISION: copy] the way into a Clarify thread that has no drafts and no replies (all deleted, or the count could not be read); the product's own thread wording
export const CLARIFY_EMPTY_THREAD_LABEL = 'Reply in thread';
export const DRAFT_MAX = 300;
export const CLARIFY_MESSAGE_MAX = 500;
