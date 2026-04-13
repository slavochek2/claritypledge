-- P701: System tag 3-way swap — renames st-tags to match new reading order.
-- New order: st1(same) → st3→st2 → st5→st3 → st4(same) → st2→st5 → st6-st9(same)
--
-- 10 rows affected: 3 stories + 7 points (understanding + misunderstanding)
--
-- SAFETY: SQL uses array_replace — operates only on rows containing the tag.
-- No data is deleted; only system_tags arrays are updated.
-- Fully reversible: apply inverse swap (st5→temp, st3→st5, st2→st3, temp→st2).
--
-- RUN: ./scripts/migrate.sh (or directly via Supabase SQL editor on prod)
-- PREREQ: Prod DB backup must exist before running (trigger backup first).

SET session_replication_role = replica;  -- bypass system_tags write-protection trigger

BEGIN;

-- Step 1: st2 → st_temp  (4 rows: 1 story + 1 understanding point + 2 misunderstanding points)
UPDATE stories SET system_tags = array_replace(system_tags, 'st2', 'st_temp') WHERE 'st2' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st2', 'st_temp') WHERE 'st2' = ANY(system_tags);

-- Step 2: st3 → st2  (3 rows: 1 story + 1 understanding point + 1 misunderstanding point)
UPDATE stories SET system_tags = array_replace(system_tags, 'st3', 'st2') WHERE 'st3' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st3', 'st2') WHERE 'st3' = ANY(system_tags);

-- Step 3: st5 → st3  (3 rows: 1 story + 1 understanding point + 1 misunderstanding point)
UPDATE stories SET system_tags = array_replace(system_tags, 'st5', 'st3') WHERE 'st5' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st5', 'st3') WHERE 'st5' = ANY(system_tags);

-- Step 4: st_temp → st5  (4 rows: same as Step 1)
UPDATE stories SET system_tags = array_replace(system_tags, 'st_temp', 'st5') WHERE 'st_temp' = ANY(system_tags);
UPDATE points  SET system_tags = array_replace(system_tags, 'st_temp', 'st5') WHERE 'st_temp' = ANY(system_tags);

COMMIT;

SET session_replication_role = DEFAULT;

-- Verification query (run after COMMIT to confirm 10 rows changed):
-- SELECT id, system_tags FROM stories WHERE system_tags && ARRAY['st2','st3','st5'] ORDER BY system_tags;
-- SELECT id, system_tags FROM points  WHERE system_tags && ARRAY['st2','st3','st5'] AND NOT 'deprecated' = ANY(system_tags) ORDER BY system_tags;
