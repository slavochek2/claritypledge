-- P1649 — behaviour + boundary test for public.resolve_series_alias / public.series_aliases.
-- Runs in ONE transaction and ROLLS BACK: no fixture survives. TEST DB only.
--   scripts/selfhosted/run-test-sql.sh < scripts/test-p1649-series-alias.sql
-- Prints 'P1649 ALL PASS' or raises on the first failed assertion.
-- Fixtures use private alias keys (zz-p1649-*) and titles, so real test-DB events cannot interfere.

BEGIN;

INSERT INTO public.series_aliases (key, title_pattern, series_slug, topic_unset, fallback_key) VALUES
  ('zz-p1649-a',     'ZZP1649A %',     NULL, false, NULL),
  ('zz-p1649-b',     'ZZP1649B %',     NULL, false, NULL),
  ('zz-p1649-c',     'ZZP1649C %',     NULL, false, NULL),
  ('zz-p1649-tie',   'ZZP1649T %',     NULL, false, NULL),
  ('zz-p1649-night', 'ZZP1649 Night%', NULL, false, NULL),
  ('zz-p1649-next',  NULL, 'zz-p1649-night', true, 'zz-p1649-night'),
  -- one-hop proof: hop2 matches an event, hop1 and the start do not. start → hop1 → hop2 must NOT reach hop2.
  ('zz-p1649-hop2',  'ZZP1649H2 %',    NULL, false, NULL),
  ('zz-p1649-hop1',  'ZZP1649H1 %',    NULL, false, 'zz-p1649-hop2'),
  ('zz-p1649-start', 'ZZP1649H0 %',    NULL, false, 'zz-p1649-hop1');

INSERT INTO public.events (id, slug, title, description, location, datetime, status, is_hidden, series_slug, statement_tag) VALUES
  -- A: public far, hidden near → public wins
  ('00000000-0000-4000-a000-000000000001', 'zz-a-public',  'ZZP1649A public',  'x', 'x', now() + interval '10 days', 'upcoming', false, NULL, NULL),
  ('00000000-0000-4000-a000-000000000002', 'zz-a-hidden',  'ZZP1649A hidden',  'x', 'x', now() + interval '2 days',  'upcoming', true,  NULL, NULL),
  -- B: only hidden → hidden
  ('00000000-0000-4000-a000-000000000003', 'zz-b-hidden',  'ZZP1649B hidden',  'x', 'x', now() + interval '3 days',  'upcoming', true,  NULL, NULL),
  -- C: past beyond grace, cancelled, and one inside grace
  ('00000000-0000-4000-a000-000000000004', 'zz-c-old',     'ZZP1649C old',     'x', 'x', now() - interval '6 hours', 'upcoming', false, NULL, NULL),
  ('00000000-0000-4000-a000-000000000005', 'zz-c-cancel',  'ZZP1649C cancel',  'x', 'x', now() + interval '1 day',   'cancelled', true, NULL, NULL),
  -- tie: two public events at the same instant → lowest id, every run
  ('00000000-0000-4000-a000-000000000007', 'zz-tie-2',     'ZZP1649T two',     'x', 'x', date_trunc('hour', now()) + interval '5 days', 'upcoming', false, NULL, NULL),
  ('00000000-0000-4000-a000-000000000006', 'zz-tie-1',     'ZZP1649T one',     'x', 'x', date_trunc('hour', now()) + interval '5 days', 'upcoming', false, NULL, NULL),
  -- /next chain: public night tomorrow WITH a topic, hidden placeholder next week → public night
  ('00000000-0000-4000-a000-000000000008', 'zz-night-pub', 'ZZP1649 Night #1: topic', 'x', 'x', now() + interval '1 day', 'upcoming', false, 'zz-p1649-night', 'zz-topic'),
  ('00000000-0000-4000-a000-000000000009', 'zz-night-ph',  'ZZP1649 Night #2: tbd',   'x', 'x', now() + interval '7 days', 'upcoming', true, 'zz-p1649-night', NULL),
  ('00000000-0000-4000-a000-00000000000a', 'zz-hop2',      'ZZP1649H2 only',  'x', 'x', now() + interval '1 day', 'upcoming', false, NULL, NULL);

DO $$
DECLARE v text; v2 text;
BEGIN
  v := public.resolve_series_alias('zz-p1649-a');
  IF v IS DISTINCT FROM 'zz-a-public' THEN RAISE EXCEPTION 'A public-wins: got %', v; END IF;

  v := public.resolve_series_alias('zz-p1649-b');
  IF v IS DISTINCT FROM 'zz-b-hidden' THEN RAISE EXCEPTION 'B only-hidden: got %', v; END IF;

  v := public.resolve_series_alias('zz-p1649-c');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'C past/cancelled must be null: got %', v; END IF;

  -- grace window: an event 4h ago resolves (inside the 5h grace)
  UPDATE public.events SET datetime = now() - interval '4 hours' WHERE slug = 'zz-c-old';
  v := public.resolve_series_alias('zz-p1649-c');
  IF v IS DISTINCT FROM 'zz-c-old' THEN RAISE EXCEPTION 'grace 4h must resolve: got %', v; END IF;
  UPDATE public.events SET datetime = now() - interval '6 hours' WHERE slug = 'zz-c-old';

  v := public.resolve_series_alias('zz-p1649-tie');
  v2 := public.resolve_series_alias('zz-p1649-tie');
  IF v IS DISTINCT FROM 'zz-tie-1' OR v2 IS DISTINCT FROM v THEN RAISE EXCEPTION 'tie: got % then %', v, v2; END IF;

  v := public.resolve_series_alias('zz-p1649-next');
  IF v IS DISTINCT FROM 'zz-night-pub' THEN RAISE EXCEPTION '/next chain public-first: got %', v; END IF;
  -- once the public night is gone, the hidden placeholder is reached (own rule, hidden pass)
  UPDATE public.events SET status = 'cancelled' WHERE slug = 'zz-night-pub';
  v := public.resolve_series_alias('zz-p1649-next');
  IF v IS DISTINCT FROM 'zz-night-ph' THEN RAISE EXCEPTION '/next chain hidden fallback: got %', v; END IF;
  UPDATE public.events SET status = 'upcoming' WHERE slug = 'zz-night-pub';
  -- own rule before fallback, both public: a public placeholder LATER than the public topic night still wins
  UPDATE public.events SET is_hidden = false, datetime = now() + interval '9 days' WHERE slug = 'zz-night-ph';
  v := public.resolve_series_alias('zz-p1649-next');
  IF v IS DISTINCT FROM 'zz-night-ph' THEN RAISE EXCEPTION '/next own-rule-first: got %', v; END IF;

  -- one hop only
  v := public.resolve_series_alias('zz-p1649-hop1');
  IF v IS DISTINCT FROM 'zz-hop2' THEN RAISE EXCEPTION 'one-hop control (hop1 reaches hop2): got %', v; END IF;
  v := public.resolve_series_alias('zz-p1649-start');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'two hops were followed: got %', v; END IF;

  -- control pair: unknown, empty, wildcard, null keys
  IF public.resolve_series_alias('zz-p1649-unknown') IS NOT NULL
     OR public.resolve_series_alias('') IS NOT NULL
     OR public.resolve_series_alias('%') IS NOT NULL
     OR public.resolve_series_alias('zz-p1649-%') IS NOT NULL
     OR public.resolve_series_alias(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'control: a non-key returned a slug';
  END IF;

  -- table constraints
  BEGIN
    INSERT INTO public.series_aliases (key, title_pattern, fallback_key) VALUES ('zz-p1649-self', 'x%', 'zz-p1649-self');
    RAISE EXCEPTION 'self-fallback row was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.series_aliases (key, title_pattern, series_slug) VALUES ('zz-p1649-both', 'x%', 'y');
    RAISE EXCEPTION 'two-rule row was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.series_aliases (key) VALUES ('zz-p1649-none');
    RAISE EXCEPTION 'no-rule row was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;

-- As the public key.
SET LOCAL ROLE anon;
DO $$
DECLARE v text; n int;
BEGIN
  v := public.resolve_series_alias('zz-p1649-b');
  IF v IS DISTINCT FROM 'zz-b-hidden' THEN RAISE EXCEPTION 'anon: hidden slug via function: got %', v; END IF;

  SELECT count(*) INTO n FROM public.events WHERE slug = 'zz-b-hidden';
  IF n <> 0 THEN RAISE EXCEPTION 'anon: P1603 boundary broken, hidden row selectable'; END IF;

  BEGIN PERFORM 1 FROM public.series_aliases; RAISE EXCEPTION 'anon SELECT on series_aliases allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.series_aliases (key, title_pattern) VALUES ('zz-p1649-evil', '%'); RAISE EXCEPTION 'anon INSERT allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.series_aliases SET title_pattern = '%'; RAISE EXCEPTION 'anon UPDATE allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.series_aliases; RAISE EXCEPTION 'anon DELETE allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$$;
RESET ROLE;

SELECT 'P1649 ALL PASS' AS result;
ROLLBACK;
