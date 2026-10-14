/**
 * P1487: the client-readable columns of `letter_deliveries`. The invitation token is not one of
 * them — the table grant omits it (migration 20261014140000), so `select('*')` is refused for
 * client roles. A column added to the table needs a grant migration AND an entry here; the
 * migration's integration test reads this constant against the live grant.
 *
 * Dependency-free on purpose, so that test can import it outside the app bundle.
 */
export const DELIVERY_COLUMNS =
  'id, letter_id, receiver_email, receiver_profile_id, invitation_expires_at, access_token_expires_at, ' +
  'status, stories_rated, opened_at, completed_at, created_at, receiver_name, read_at, saved_story_index, notified_at';
