-- client-safe: no client calls topic_score (grep src/ returns nothing); its only callers are SECURITY DEFINER functions, which run as the owner and keep EXECUTE.
-- new functions: none
-- topic_score(numeric,numeric) was created in 20261001180000 without a REVOKE, so it kept
-- Postgres's default EXECUTE-to-PUBLIC grant and the grant drift check (2026-10-06) flagged it
-- as anon-executable with no anon call site. It is pure arithmetic and reads no data, so this
-- closes an unapproved surface, not a leak.
REVOKE EXECUTE ON FUNCTION public.topic_score(numeric, numeric) FROM PUBLIC, anon, authenticated;
