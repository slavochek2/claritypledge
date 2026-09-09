-- Migration: P1275 (contract half) — close the direct INSERT path on transcribe_rooms
-- Created: 2026-09-08
-- Spec: features/p1275_transcribe_room_creation_fails_rls.md
-- Pairs with: 20260908210000_p1275_create_transcribe_room_rpc.sql (expand half)
--
-- WHY THIS EXISTS. The expand half added create_transcribe_room(), which writes a room and
-- its creator's membership in one transaction. That makes a member-less room unreachable
-- *through the function*. It does NOT make one unrepresentable, because P1149's INSERT
-- policy is still `WITH CHECK (true)`:
--
--   supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql
--     CREATE POLICY "authenticated users can create rooms"
--       ON public.transcribe_rooms FOR INSERT TO authenticated WITH CHECK (true);
--
-- RLS is enforced at PostgREST, not by the JS client, so "no app code does this any more"
-- is not a control. Any authenticated caller can POST /rest/v1/transcribe_rooms directly
-- and create a room with no membership row, no session-ownership check, and no code-shape
-- check — a room that its own creator cannot read (member-scoped SELECT, P1207) and cannot
-- end (member-scoped UPDATE, P1149). Verified rather than reasoned: with
-- SET LOCAL ROLE authenticated, a bare INSERT with no RETURNING succeeds today.
--
-- Found in review of the expand half, which claimed in its own comments that the state was
-- "not a representable state". That claim was true only of callers going through the
-- function. The comment has been corrected and this migration makes the claim true.
--
-- WHY `WITH CHECK (false)` RATHER THAN DROPPING THE POLICY. Dropping it would leave the
-- table with no INSERT policy at all, which denies by default and reads identically to a
-- policy that was lost in a bad merge. An explicit `false` says the refusal is deliberate
-- and carries its reason in the catalog, where the next person debugging a failed insert
-- will actually look. It is also reversible with a second ALTER rather than a re-CREATE.
--
-- The service role is unaffected — it bypasses RLS entirely, which is how the e2e fixtures
-- and any future admin tooling seed rooms.
--
-- requires-frontend: 3255fd18b
--   The client commit that routes createRoom() through the RPC, AS IT LANDED ON MAIN.
--   This marker first named 68072bc79 — the same change's SHA on the feature branch —
--   which `git-ops.sh ship` then cherry-picked into a new commit, orphaning it. The gate
--   correctly refused to apply and would have refused forever, because a branch SHA can
--   never become an ancestor of origin/main under a cherry-pick merge strategy. Write this
--   marker post-ship, or re-point it at the cherry-picked SHA before the prod apply. Deploying this ahead of
--   that bundle removes the only path the deployed client has to create a room.
--   In practice that path is ALREADY broken in prod — it fails on the RETURNING read-back,
--   which is the bug this spec exists to fix — so this migration takes a create that
--   currently errors and makes it error differently. Nothing that works today stops
--   working. The marker is still correct: order it after the client, not before.

ALTER POLICY "authenticated users can create rooms"
  ON public.transcribe_rooms
  WITH CHECK (false);

COMMENT ON POLICY "authenticated users can create rooms" ON public.transcribe_rooms IS
  'P1275: deliberately WITH CHECK (false) — rooms are created ONLY by '
  'create_transcribe_room(), which writes the room and its creator''s membership in one '
  'transaction. A direct insert here would produce a room its creator can neither read '
  '(P1207 member-scoped SELECT) nor end (P1149 member-scoped UPDATE). Do not relax this '
  'to restore a direct create path; extend the function instead.';
