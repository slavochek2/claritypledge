/**
 * P1631: every sentence of the Clarify thread. The first group is enumerated by the spec; the second is new and awaits the founder.
 */
// Enumerated by the spec / design contract.
export const CLARIFY_TITLE = 'Your Mirror';
export const CLARIFY_SUBTITLE = 'Only you see this';
export const DRAFT_PILL = 'Draft';
export const CITED_LABEL = 'Cited lines (may be wrong)';
export const ANOTHER_POINT_LABEL = 'Another point';
export const CLARIFY_LABEL = 'Clarify';

// [FOUNDER DECISION: copy] new in P1631, not in the spec.
export const RETRY_LABEL = 'Retry';
export const DRAFT_PRIVATE_LABEL = 'Private';
export const EMPTY_DRAFT_TEXT = 'A point needs some words.';
export const SAVE_FAILED_TEXT = 'Could not save this point. Try again.';
export const DELETE_TITLE = 'Delete this draft?';
export const DELETE_DESCRIPTION = 'It is removed from your Mirror.';
export const NO_SPLIT_TEXT = 'Nothing here to test yet. Pick what to test instead:';
export const FAILED_TEXT = 'Could not make a point from this.';
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
