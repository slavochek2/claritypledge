-- P1403 amendment (2026-10-04): a series review can point at the reviewer's profile, so the
-- page shows their avatar (with pledge ring) and links their name — instead of a text-only name.
-- client-safe: additive only — one new nullable column on series_reviews. Old clients never
-- select it; author_name stays the fallback when it is NULL.
--
-- ON DELETE SET NULL: an erased profile (P520 erase_my_account) must not block deletion; the
-- review falls back to its author_name text. No new grant or policy: series_reviews already
-- grants SELECT to anon/authenticated, and the joined profiles columns (name, slug, avatar_color,
-- avatar_url, has_pledged) are already in the profiles column GRANT (P877).

ALTER TABLE public.series_reviews
  ADD COLUMN IF NOT EXISTS author_profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS series_reviews_author_profile_idx
  ON public.series_reviews (author_profile_id)
  WHERE author_profile_id IS NOT NULL;
