-- P1212 §2, sixth pass: turn the rename's silent skip into a loud one.
--
-- client-safe: adds no function, no policy and no column. It raises if and only if an agent
-- account is still sitting in the retired namespace, which is a state no environment is in
-- (test: 0 after 20260904170000's UPDATE, verified; prod: 0 machine- slugs at all, verified
-- 2026-09-04 against 107 profiles). On a database where it does raise, raising is the point.
--
-- WHY. 20260904170000's rename carries `AND NOT EXISTS (... q.slug = 'agent-' || ...)` — a
-- collision guard that is correct and, on its own, SILENT. A row that collides keeps its
-- machine-* slug and the migration reports success. That row is necessarily an agent account
-- (the UPDATE's own EXISTS on agent_accounts guarantees it), and it is now stranded:
-- create_or_reuse_agent_account refuses the retired prefix, the client guard refuses it too,
-- so nothing short of another migration can move it. The failure mode is not the collision;
-- it is not being told about the collision.
--
-- This is the cheap half of a guard that was written with only its safe half. A DO block that
-- reads one count costs nothing on every future `migrate.sh` run and converts "the rename
-- quietly did four of five" into a hard stop naming the rows.
--
-- Deliberately NOT a CHECK constraint on profiles.slug: the invariant is about the JOIN to
-- agent_accounts, not about the column, and a constraint would also have to hold for every
-- future insert, which is create_or_reuse_agent_account's job and already covered there.

DO $$
DECLARE
  v_stranded text[];
BEGIN
  SELECT array_agg(p.slug ORDER BY p.slug) INTO v_stranded
  FROM public.profiles p
  WHERE p.slug LIKE 'machine-%'
    AND EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = p.id);

  IF v_stranded IS NOT NULL AND array_length(v_stranded, 1) > 0 THEN
    RAISE EXCEPTION
      'P1212: % agent account(s) are stranded in the retired "machine-" namespace: %. '
      'The 20260904170000 rename skipped them, almost certainly on its collision guard — an '
      '"agent-" slug already exists for the same name. Resolve each by hand and re-run; they '
      'cannot be moved by create_or_reuse_agent_account, which now refuses the retired prefix.',
      array_length(v_stranded, 1), array_to_string(v_stranded, ', ');
  END IF;
END $$;
