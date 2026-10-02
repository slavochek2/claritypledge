-- P1386 amendment (founder, 2026-10-02): the preparation step now asks "do you have a microphone to
-- bring?" and, only for people who need one, "what does your phone plug into?". Two new answers:
--   'lightning' = needs a mic, phone has Lightning; 'other' = needs a mic, something else / not sure.
-- 'none' stays valid: old rows carry it, and a cached older client may still write usbc / own / none.
--
-- client-safe: purely widens the allowed values; no row is rewritten, no signature changes.
-- diffed against: 20261001120000_p1336_event_preparations.sql (the unnamed inline CHECK on
--   event_preparations.mic_setup, line 74).
--
-- The CHECK was declared inline without a name, so it is found by its definition rather than by an
-- assumed auto-generated name: a wrong name in DROP ... IF EXISTS would silently do nothing and the
-- ADD below would then reject every new value.

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.event_preparations'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%mic_setup%'
  LOOP
    EXECUTE format('ALTER TABLE public.event_preparations DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.event_preparations
  ADD CONSTRAINT event_preparations_mic_setup_check
  CHECK (mic_setup IN ('usbc', 'own', 'lightning', 'other', 'none'));

COMMENT ON COLUMN public.event_preparations.mic_setup IS
  'own = brings a mic. usbc / lightning / other = needs one, by what the phone plugs into (other = something else or unsure). none = the retired "no microphone" answer, old rows only. research_state: usbc and own are confirmed (a recording place); lightning and other are eligible (consented, but the host cannot equip them, so they take no place).';
