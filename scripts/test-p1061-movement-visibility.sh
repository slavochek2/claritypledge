#!/usr/bin/env bash
# scripts/test-p1061-movement-visibility.sh: P1061 Done-When 2. The two movement read functions return nothing a
# caller cannot already read today. Runs against the self-hosted TEST database (scripts/selfhosted/run-test-sql.sh)
# inside ONE transaction that always ends in ROLLBACK: the one seeded row (a former holder) never persists.
#
# Probes, each as the real caller (SET LOCAL ROLE + request.jwt.claims), never as the owner:
#   anon            no history, explain-back or event/group of a non-public point or story it cannot read
#   stranger        a signed-in account that is neither the point's first validator nor a holder: the same
#   former holder   of a non-public point: their own history only, never another holder's
#   letter speaker  a letter explain-back never appears, even to the one person who may read it
#   private member  a private group is never offered, even to its own member
#   signed out      a PUBLIC point whose holders are in events and groups: no event or group for anon, while a
#                   signed-in caller is offered some (the positive control that makes the anon result mean something)
#   private story   counted for its author, not for anyone else (a count built from part of its rows is wrong); the
#                   "not for anyone else" half runs as the owner with the stranger's identity, so only the function's
#                   own filter decides it (P1061_CONTROL_FILTERLESS=1 below proves it can fail)
#   point guard     a non-public point returns no rows for anyone but its first validator; runs as the owner with
#                   the stranger's identity (P1061_CONTROL_UNGUARDED=1 below proves it can fail), and with the
#                   validator's identity the same point still answers
#   completeness    1200 extra history rows behind one story come back whole (no 1000-row page cut, Done-When 4)
# Control (gate 7): the OWNER sees the history the callers are denied, so a 0 above is a real refusal, not an
# empty fixture. P1061_CONTROL_DEFINER=1 (below) proves the probes that depend on row-level policies can fail. The
# letter, private-group, signed-out and private-story probes test the functions' own filters instead: they hold with
# or without the policies, and a definer control does not move them. P1061_CONTROL_FILTERLESS=1 restores the first
# version of the story function (no whole-rows filter) inside the same rolled-back transaction: the private-story
# probe must then fail.
#
# Output lines use ":" separators only (shell-safety.md). Exit 0 all pass, 1 a probe failed (under a single control: exactly
# its expected probes failed), 2 could not run, 3 a single control failed a different set than expected.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
SQL_RUNNER="$ROOT/scripts/selfhosted/run-test-sql.sh"
[ -x "$SQL_RUNNER" ] || { echo "p1061-visibility: missing $SQL_RUNNER" >&2; exit 2; }

read -r -d '' SQL <<'EOSQL' || true
-- Pick the cases from what TEST holds.
SELECT set_config('p1061.point', (
  SELECT p.id::text FROM public.points p
   WHERE p.visibility <> 'public'
     AND EXISTS (SELECT 1 FROM public.point_position_history h WHERE h.point_id = p.id AND h.user_id <> p.first_validator_id)
   ORDER BY p.id LIMIT 1), true);
SELECT set_config('p1061.validator', (SELECT first_validator_id::text FROM public.points WHERE id = current_setting('p1061.point')::uuid), true);
-- A stranger: a profile with no position or history on the point, not its validator.
SELECT set_config('p1061.stranger', (
  SELECT pr.id::text FROM public.profiles pr
   WHERE pr.id::text <> current_setting('p1061.validator')
     AND NOT EXISTS (SELECT 1 FROM public.point_position_history h WHERE h.point_id = current_setting('p1061.point')::uuid AND h.user_id = pr.id)
     AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = current_setting('p1061.point')::uuid AND pp.user_id = pr.id)
   ORDER BY pr.id LIMIT 1), true);
-- A former holder: another such profile, given one history row and no current position (rolled back below).
SELECT set_config('p1061.former', (
  SELECT pr.id::text FROM public.profiles pr
   WHERE pr.id::text NOT IN (current_setting('p1061.validator'), current_setting('p1061.stranger'))
     AND NOT EXISTS (SELECT 1 FROM public.point_position_history h WHERE h.point_id = current_setting('p1061.point')::uuid AND h.user_id = pr.id)
     AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = current_setting('p1061.point')::uuid AND pp.user_id = pr.id)
   ORDER BY pr.id DESC LIMIT 1), true);
INSERT INTO public.point_position_history (point_id, user_id, position, changed_at)
  VALUES (current_setting('p1061.point')::uuid, current_setting('p1061.former')::uuid, 'agree', now() - interval '1 day');
-- A story linked to the non-public point, and a letter row with its speaker.
SELECT set_config('p1061.story_private', COALESCE((SELECT sp.story_id::text FROM public.story_points sp JOIN public.points p ON p.id = sp.point_id WHERE p.visibility <> 'public' ORDER BY sp.story_id LIMIT 1), ''), true);
-- Computed as the owner: a probe that joined points as the caller could not see the very rows it looks for.
SELECT set_config('p1061.private_points', COALESCE((SELECT string_agg(id::text, ',') FROM public.points WHERE visibility <> 'public'), ''), true);
SELECT set_config('p1061.letter_story', COALESCE((SELECT story_id::text FROM public.story_verifications WHERE source = 'letter' AND story_id IS NOT NULL ORDER BY id LIMIT 1), ''), true);
SELECT set_config('p1061.letter_speaker', COALESCE((SELECT speaker_id::text FROM public.story_verifications WHERE source = 'letter' AND story_id::text = current_setting('p1061.letter_story') ORDER BY id LIMIT 1), ''), true);
-- A member of a private group who holds a position on a PUBLIC point, and that point. Public, so the point guard
-- (20261117200000) never empties the answer first: the probe must reach the function's own group filter.
SELECT set_config('p1061.private_member', COALESCE((
  SELECT m.user_id::text FROM public.membership m JOIN public.organization o ON o.id = m.org_id
   WHERE o.visibility = 'private' AND EXISTS (
     SELECT 1 FROM public.point_positions pp JOIN public.points p ON p.id = pp.point_id AND p.visibility = 'public'
      WHERE pp.user_id = m.user_id)
   ORDER BY m.user_id LIMIT 1), ''), true);
SELECT set_config('p1061.private_member_point', COALESCE((
  SELECT pp.point_id::text FROM public.point_positions pp JOIN public.points p ON p.id = pp.point_id AND p.visibility = 'public'
   WHERE pp.user_id::text = current_setting('p1061.private_member') ORDER BY pp.point_id LIMIT 1), ''), true);
SELECT set_config('p1061.private_orgs', COALESCE((SELECT string_agg(id::text, ',') FROM public.organization WHERE visibility = 'private'), ''), true);

-- Completeness (Done-When 4): 1200 more history rows on a public story point, for a verified listener of that
-- story. A read that stopped at PostgREST's 1000-row page would lose some; the function's one jsonb value must not.
SELECT set_config('p1061.big_pair', COALESCE((
  SELECT sp.point_id::text || '|' || sv.listener_id::text || '|' || s.id::text
    FROM public.story_verifications sv
    JOIN public.stories s ON s.id = sv.story_id AND s.visibility = 'public'
    JOIN public.story_points sp ON sp.story_id = s.id
    JOIN public.points p ON p.id = sp.point_id AND p.visibility = 'public' AND p.superseded_by IS NULL
   WHERE sv.source = 'live' AND sv.speaker_id = s.author_id AND sv.listener_id IS NOT NULL AND sv.listener_id <> s.author_id
   ORDER BY sv.id LIMIT 1), ''), true);
INSERT INTO public.point_position_history (point_id, user_id, position, changed_at)
  SELECT split_part(current_setting('p1061.big_pair'), '|', 1)::uuid, split_part(current_setting('p1061.big_pair'), '|', 2)::uuid,
         (ARRAY['agree','disagree']::public.position_type[])[1 + g % 2], now() - make_interval(days => 400) + make_interval(mins => g)
    FROM generate_series(1, 1200) g
   WHERE current_setting('p1061.big_pair') <> '';
SELECT set_config('p1061.big_expected', (
  SELECT count(*)::text FROM public.point_position_history
   WHERE current_setting('p1061.big_pair') <> ''
     AND point_id = NULLIF(split_part(current_setting('p1061.big_pair'), '|', 1), '')::uuid
     AND user_id = NULLIF(split_part(current_setting('p1061.big_pair'), '|', 2), '')::uuid), true);

-- A public point whose holders are registered for a (not cancelled, not hidden) event, and a signed-in profile.
SELECT set_config('p1061.public_point_ev', COALESCE((
  SELECT pp.point_id::text FROM public.point_positions pp
    JOIN public.points p ON p.id = pp.point_id AND p.visibility = 'public'
    JOIN public.event_rsvps r ON r.profile_id = pp.user_id
    JOIN public.events ev ON ev.id = r.event_id AND NOT ev.is_hidden AND ev.status IS DISTINCT FROM 'cancelled'
   ORDER BY pp.point_id LIMIT 1), ''), true);
-- A private story and its author.
SELECT set_config('p1061.private_story', COALESCE((SELECT id::text FROM public.stories WHERE visibility <> 'public' ORDER BY id LIMIT 1), ''), true);
SELECT set_config('p1061.private_story_author', COALESCE((SELECT author_id::text FROM public.stories WHERE id::text = current_setting('p1061.private_story')), ''), true);

-- Control: the owner sees other holders' history on the point.
SELECT set_config('p1061.control', (SELECT (count(*) > 0)::text FROM public.point_position_history WHERE point_id = current_setting('p1061.point')::uuid AND user_id::text <> current_setting('p1061.former')), true);

-- anon
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('p1061.anon_point', (
  SELECT (jsonb_array_length(r->'history') = 0 AND jsonb_array_length(r->'verifications') = 0 AND jsonb_array_length(r->'events') = 0 AND jsonb_array_length(r->'groups') = 0)::text
    FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
SELECT set_config('p1061.anon_story', (
  SELECT CASE WHEN current_setting('p1061.story_private') = '' THEN 'skip' ELSE (
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'story_points') e WHERE (e->>'point_id') = ANY(string_to_array(current_setting('p1061.private_points'), ',')))
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'history') e WHERE (e->>'point_id') = ANY(string_to_array(current_setting('p1061.private_points'), ',')))
  )::text END
    FROM (SELECT public.get_story_movement_rows(ARRAY[NULLIF(current_setting('p1061.story_private'), '')::uuid]) r) x), true);
SELECT set_config('p1061.anon_public_targets', (
  SELECT CASE WHEN current_setting('p1061.public_point_ev') = '' THEN 'skip' ELSE (
    jsonb_array_length(r->'events') = 0 AND jsonb_array_length(r->'groups') = 0 AND jsonb_array_length(r->'current') > 0)::text END
    FROM (SELECT public.get_point_movement_rows(NULLIF(current_setting('p1061.public_point_ev'), '')::uuid) r) x), true);
SELECT set_config('p1061.big_returned', (
  SELECT CASE WHEN current_setting('p1061.big_pair') = '' THEN 'skip' ELSE (
    SELECT count(*)::text FROM jsonb_array_elements(r->'history') e
     WHERE e->>'point_id' = split_part(current_setting('p1061.big_pair'), '|', 1)
       AND e->>'user_id' = split_part(current_setting('p1061.big_pair'), '|', 2)) END
    FROM (SELECT public.get_story_movement_rows(ARRAY[NULLIF(split_part(current_setting('p1061.big_pair'), '|', 3), '')::uuid]) r) x), true);
RESET ROLE;

-- stranger
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.stranger'), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.stranger_point', (
  SELECT (jsonb_array_length(r->'history') = 0)::text FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
-- Positive control for the signed-out probe: a signed-in caller IS offered the events on that public point.
SELECT set_config('p1061.signed_in_targets', (
  SELECT CASE WHEN current_setting('p1061.public_point_ev') = '' THEN 'skip' ELSE (jsonb_array_length(r->'events') > 0)::text END
    FROM (SELECT public.get_point_movement_rows(NULLIF(current_setting('p1061.public_point_ev'), '')::uuid) r) x), true);
RESET ROLE;

-- The function's own rule, alone: as the OWNER (row-level policies bypassed, as a chat share lets a participant read a
-- private story) with the stranger's identity, a private story that is not theirs is still not counted. Under the
-- caller's role this check could not fail (the policies would hide the story anyway); here only the filter decides.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.stranger'), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.private_story_stranger', (
  SELECT CASE WHEN current_setting('p1061.private_story') = '' OR current_setting('p1061.private_story_author') = current_setting('p1061.stranger') THEN 'skip'
              ELSE (jsonb_array_length(r->'stories') = 0)::text END
    FROM (SELECT public.get_story_movement_rows(ARRAY[NULLIF(current_setting('p1061.private_story'), '')::uuid]) r) x), true);
-- The point guard alone (20261117200000), same owner-with-stranger's-identity setup: the non-public point the stranger
-- did not validate returns no rows at all, although the owner reads its whole history. Under the caller's role the
-- policies would hide it anyway; here only the function's guard decides (P1061_CONTROL_UNGUARDED=1 proves it can fail).
SELECT set_config('p1061.point_guard_non_validator', (
  -- every list the function returns, so a later edit that stops one of them from depending on the guard fails here
  SELECT (r->>'point_id' IS NULL AND NOT EXISTS (
            SELECT 1 FROM unnest(ARRAY['stories','verifications','history','current','agent_ids','profiles','events','groups']) k
             WHERE jsonb_array_length(COALESCE(r->k, '[]'::jsonb)) <> 0 OR NOT (r ? k)))::text
    FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
-- Its positive half, as the real caller: the first validator, under their own role and policies, gets the same point
-- with its WHOLE history (every row the owner sees, the seeded former holder's included), so the guard does not refuse
-- the one non-public caller it must serve, and a partial answer would fail here.
SELECT set_config('p1061.point_history_all', (
  SELECT count(*)::text FROM public.point_position_history WHERE point_id = current_setting('p1061.point')::uuid), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.validator'), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.point_guard_validator', (
  SELECT (r->>'point_id' = current_setting('p1061.point')
          AND jsonb_array_length(r->'history') = current_setting('p1061.point_history_all')::int)::text
    FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
RESET ROLE;

-- the private story's author: their own story is counted
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', NULLIF(current_setting('p1061.private_story_author'), ''), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.private_story_author_sees', (
  SELECT CASE WHEN current_setting('p1061.private_story') = '' THEN 'skip' ELSE (jsonb_array_length(r->'stories') = 1)::text END
    FROM (SELECT public.get_story_movement_rows(ARRAY[NULLIF(current_setting('p1061.private_story'), '')::uuid]) r) x), true);
RESET ROLE;

-- former holder: their own row only
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.former'), 'role', 'authenticated')::text, true);
-- Never another holder's row. (They get none at all: the point row is unreadable to them, and since 20261117200000
-- the point guard refuses a non-validator anyway; less than today is allowed, more never is.)
SELECT set_config('p1061.former_rows', (
  SELECT jsonb_array_length(r->'history')::text FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
SELECT set_config('p1061.former_point', (
  SELECT (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'history') e WHERE e->>'user_id' <> current_setting('p1061.former')))::text
    FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
RESET ROLE;

-- letter speaker: the letter row never appears
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', NULLIF(current_setting('p1061.letter_speaker'), ''), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.letter', (
  SELECT CASE WHEN current_setting('p1061.letter_story') = '' THEN 'skip' ELSE (NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'verifications') e
     JOIN public.story_verifications sv ON sv.id = (e->>'id')::uuid WHERE sv.source = 'letter'))::text END
    FROM (SELECT public.get_story_movement_rows(ARRAY[NULLIF(current_setting('p1061.letter_story'), '')::uuid]) r) x), true);
RESET ROLE;

-- private group member: their private group is never offered
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', NULLIF(current_setting('p1061.private_member'), ''), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.private_group', (
  SELECT CASE WHEN current_setting('p1061.private_member') = '' THEN 'skip' ELSE (
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'groups') g WHERE (g->>'id') = ANY(string_to_array(current_setting('p1061.private_orgs'), ',')))
  )::text END
    FROM (SELECT public.get_point_movement_rows(NULLIF(current_setting('p1061.private_member_point'), '')::uuid) r) x), true);
RESET ROLE;

SELECT current_setting('p1061.control') AS control_owner_sees_history,
       current_setting('p1061.anon_point') AS anon_point,
       current_setting('p1061.anon_story') AS anon_story,
       current_setting('p1061.stranger_point') AS stranger_point,
       current_setting('p1061.former_point') AS former_holder_point,
       current_setting('p1061.former_rows') AS info_former_holder_rows,
       current_setting('p1061.letter') AS letter_row_absent,
       current_setting('p1061.private_group') AS private_group_absent,
       current_setting('p1061.anon_public_targets') AS anon_no_events_on_public_point,
       current_setting('p1061.signed_in_targets') AS signed_in_offered_events,
       current_setting('p1061.private_story_stranger') AS private_story_not_counted_for_stranger,
       current_setting('p1061.private_story_author_sees') AS private_story_counted_for_author,
       current_setting('p1061.point_guard_non_validator') AS point_guard_non_validator,
       current_setting('p1061.point_guard_validator') AS point_guard_validator_served,
       CASE WHEN current_setting('p1061.big_returned') = 'skip' THEN 'skip'
            ELSE (current_setting('p1061.big_returned') = current_setting('p1061.big_expected') AND current_setting('p1061.big_expected')::int > 1000)::text END AS complete_beyond_1000,
       current_setting('p1061.big_returned') || ' of ' || current_setting('p1061.big_expected') AS info_rows_returned;
ROLLBACK;
EOSQL

# Known-bad control (gate 7): P1061_CONTROL_DEFINER=1 turns both functions SECURITY DEFINER inside the same
# rolled-back transaction, so they read past the caller's policies. The probes must then FAIL; if they pass, they
# cannot see an exposure.
# Since 20261117200000 the point guard refuses the same callers the policies do, so the definer control alone no
# longer moves the point probes: it also restores the unguarded body (P1061_CONTROL_UNGUARDED, prepended after this,
# so it runs first and the ALTER applies to it).
# Each control run alone must fail EXACTLY its own set of probes (exit 1); any other set exits 3, so a control that
# fails for the wrong reason cannot pass as proof. The definer set differs from the unguarded set by the three probes
# that only row-level policies decide, which is what proves the ALTER took effect. Controls run one at a time: a
# value other than 1, or two controls together, is refused (exit 2), so no run can skip the expected-set check.
EXPECT_FAIL=""
for v in "${P1061_CONTROL_DEFINER:-}" "${P1061_CONTROL_FILTERLESS:-}" "${P1061_CONTROL_UNGUARDED:-}"; do
  case "$v" in ""|1) ;; *) echo "p1061-visibility: a control flag must be 1 or unset" >&2; exit 2 ;; esac
done
case "${P1061_CONTROL_DEFINER:-}${P1061_CONTROL_FILTERLESS:-}${P1061_CONTROL_UNGUARDED:-}" in
  "") ;;
  1)
    [ "${P1061_CONTROL_DEFINER:-}" = "1" ] && EXPECT_FAIL="anon_point,stranger_point,former_holder_point,point_guard_non_validator"
    [ "${P1061_CONTROL_FILTERLESS:-}" = "1" ] && EXPECT_FAIL="private_story_not_counted_for_stranger,point_guard_non_validator"
    [ "${P1061_CONTROL_UNGUARDED:-}" = "1" ] && EXPECT_FAIL="point_guard_non_validator"
    ;;
  *) echo "p1061-visibility: run one control at a time" >&2; exit 2 ;;
esac
if [ "${P1061_CONTROL_DEFINER:-}" = "1" ]; then
  P1061_CONTROL_UNGUARDED=1
  echo "p1061-visibility: control: definer also restores the unguarded point body (P1061_CONTROL_UNGUARDED)" >&2
  SQL="ALTER FUNCTION public.get_point_movement_rows(uuid) SECURITY DEFINER;
ALTER FUNCTION public.get_story_movement_rows(uuid[]) SECURITY DEFINER;
$SQL"
fi
if [ "${P1061_CONTROL_FILTERLESS:-}" = "1" ]; then
  FIRST="$ROOT/supabase/migrations/20261117160000_p1061_position_movement_reads.sql"
  [ -r "$FIRST" ] || { echo "p1061-visibility: control source missing: $FIRST" >&2; exit 2; }
  SQL="$(grep -v '^BEGIN;$' "$FIRST" | grep -v '^COMMIT;$')
$SQL"
fi
if [ "${P1061_CONTROL_UNGUARDED:-}" = "1" ]; then
  # Restores the function as it was before the point guard (20261117190000), inside the same rolled-back
  # transaction: point_guard_non_validator must then fail.
  PREV="$ROOT/supabase/migrations/20261117190000_p1061_movement_reads_whole_rows_only.sql"
  [ -r "$PREV" ] || { echo "p1061-visibility: control source missing: $PREV" >&2; exit 2; }
  SQL="$(grep -v '^BEGIN;$' "$PREV" | grep -v '^COMMIT;$')
$SQL"
fi
OUT="$(printf '%s\n' "$SQL" | "$SQL_RUNNER")" || { echo "p1061-visibility: the SQL did not run" >&2; exit 2; }
echo "p1061-visibility: $OUT" | tr '>' ' '
python3 - "$OUT" "$EXPECT_FAIL" <<'EOPY'
import json, sys
expect = sorted(k for k in sys.argv[2].split(",") if k)
# An answer that is not a result row proves nothing either way: "could not run" (2), never "a probe failed" (1),
# which under a control would read as a correct detection.
try:
    rows = json.loads(sys.argv[1])
except ValueError:
    print("p1061-visibility: CANNOT JUDGE: the runner's answer is not JSON"); sys.exit(2)
if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
    print("p1061-visibility: CANNOT JUDGE: no result row"); sys.exit(2)
row = rows[0]
# Every probe must be in the answer: a column dropped from the final SELECT would otherwise vanish as a silent pass.
REQUIRED = ["control_owner_sees_history", "anon_point", "anon_story", "stranger_point", "former_holder_point",
            "letter_row_absent", "private_group_absent", "anon_no_events_on_public_point", "signed_in_offered_events",
            "private_story_not_counted_for_stranger", "private_story_counted_for_author", "point_guard_non_validator",
            "point_guard_validator_served", "complete_beyond_1000"]
missing = [k for k in REQUIRED if k not in row]
if missing:
    print("p1061-visibility: CANNOT JUDGE: probes missing from the answer: " + ", ".join(missing)); sys.exit(2)
if row.get("control_owner_sees_history") != "true":
    print("p1061-visibility: CANNOT JUDGE: the owner sees no other history on the chosen point, so a 0 proves nothing"); sys.exit(2)
failed = [k for k, v in row.items() if k != "control_owner_sees_history" and not k.startswith("info_") and v not in ("true", "skip")]
skipped = [k for k, v in row.items() if v == "skip"]
for k in skipped:
    print(f"p1061-visibility: SKIP: {k} (TEST holds no such case)")
if expect and sorted(failed) != expect:
    print("p1061-visibility: CONTROL MISMATCH: expected to fail " + ", ".join(expect) + " but failed " + (", ".join(sorted(failed)) or "nothing")); sys.exit(3)
if failed:
    print("p1061-visibility: FAIL: " + ", ".join(failed)); sys.exit(1)
print("p1061-visibility: PASS: every probe")
EOPY
