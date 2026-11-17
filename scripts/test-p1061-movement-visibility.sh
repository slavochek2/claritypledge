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
#   completeness    1200 extra history rows behind one story come back whole (no 1000-row page cut, Done-When 4)
# Control (gate 7): the OWNER sees the history the callers are denied, so a 0 above is a real refusal, not an
# empty fixture.
#
# Output lines use ":" separators only (shell-safety.md). Exit 0 all pass, 1 a probe failed, 2 could not run.
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
SELECT set_config('p1061.letter_story', (SELECT story_id::text FROM public.story_verifications WHERE source = 'letter' ORDER BY id LIMIT 1), true);
SELECT set_config('p1061.letter_speaker', (SELECT speaker_id::text FROM public.story_verifications WHERE source = 'letter' AND story_id = current_setting('p1061.letter_story')::uuid ORDER BY id LIMIT 1), true);
-- A member of a private group who holds a position somewhere, and that point.
SELECT set_config('p1061.private_member', COALESCE((
  SELECT m.user_id::text FROM public.membership m JOIN public.organization o ON o.id = m.org_id
   WHERE o.visibility = 'private' AND EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.user_id = m.user_id)
   ORDER BY m.user_id LIMIT 1), ''), true);
SELECT set_config('p1061.private_member_point', COALESCE((
  SELECT pp.point_id::text FROM public.point_positions pp WHERE pp.user_id::text = current_setting('p1061.private_member') ORDER BY pp.point_id LIMIT 1), ''), true);
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
RESET ROLE;

-- former holder: their own row only
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.former'), 'role', 'authenticated')::text, true);
-- Never another holder's row. (They may get fewer than their own: the point row itself is unreadable to them, so
-- the function finds no point; less than today is allowed, more never is.)
SELECT set_config('p1061.former_rows', (
  SELECT jsonb_array_length(r->'history')::text FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
SELECT set_config('p1061.former_point', (
  SELECT (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'history') e WHERE e->>'user_id' <> current_setting('p1061.former')))::text
    FROM (SELECT public.get_point_movement_rows(current_setting('p1061.point')::uuid) r) x), true);
RESET ROLE;

-- letter speaker: the letter row never appears
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('p1061.letter_speaker'), 'role', 'authenticated')::text, true);
SELECT set_config('p1061.letter', (
  SELECT (NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'verifications') e
     JOIN public.story_verifications sv ON sv.id = (e->>'id')::uuid WHERE sv.source = 'letter'))::text
    FROM (SELECT public.get_story_movement_rows(ARRAY[current_setting('p1061.letter_story')::uuid]) r) x), true);
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
       CASE WHEN current_setting('p1061.big_returned') = 'skip' THEN 'skip'
            ELSE (current_setting('p1061.big_returned') = current_setting('p1061.big_expected') AND current_setting('p1061.big_expected')::int > 1000)::text END AS complete_beyond_1000,
       current_setting('p1061.big_returned') || ' of ' || current_setting('p1061.big_expected') AS info_rows_returned;
ROLLBACK;
EOSQL

# Known-bad control (gate 7): P1061_CONTROL_DEFINER=1 turns both functions SECURITY DEFINER inside the same
# rolled-back transaction, so they read past the caller's policies. The probes must then FAIL; if they pass, they
# cannot see an exposure.
if [ "${P1061_CONTROL_DEFINER:-}" = "1" ]; then
  SQL="ALTER FUNCTION public.get_point_movement_rows(uuid) SECURITY DEFINER;
ALTER FUNCTION public.get_story_movement_rows(uuid[]) SECURITY DEFINER;
$SQL"
fi
OUT="$(printf '%s\n' "$SQL" | "$SQL_RUNNER")" || { echo "p1061-visibility: the SQL did not run" >&2; exit 2; }
echo "p1061-visibility: $OUT" | tr '>' ' '
python3 - "$OUT" <<'EOPY'
import json, sys
rows = json.loads(sys.argv[1])
if not rows:
    print("p1061-visibility: FAIL: no result row"); sys.exit(1)
row = rows[0]
if row.get("control_owner_sees_history") != "true":
    print("p1061-visibility: CANNOT JUDGE: the owner sees no other history on the chosen point, so a 0 proves nothing"); sys.exit(2)
failed = [k for k, v in row.items() if k != "control_owner_sees_history" and not k.startswith("info_") and v not in ("true", "skip")]
skipped = [k for k, v in row.items() if v == "skip"]
for k in skipped:
    print(f"p1061-visibility: SKIP: {k} (TEST holds no such case)")
if failed:
    print("p1061-visibility: FAIL: " + ", ".join(failed)); sys.exit(1)
print("p1061-visibility: PASS: every probe")
EOPY
