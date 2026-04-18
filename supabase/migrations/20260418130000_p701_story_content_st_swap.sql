-- P701 cleanup: rewrite story content hashtags to match post-swap system_tags.
-- Background: 20260413100000_p701_st_swap.sql swapped system_tags via
-- array_replace but did not touch stories.content, leaving 3 rows drifted.
-- Search pickers match on content substring → stale results.
--
-- Cycle: st2→st5, st3→st2, st5→st3 (same as system_tags swap).
-- Per-row UPDATE by id to avoid touching unrelated rows with coincidental text.

BEGIN;

-- Story 86d57f0f: content #st2 → #st_temp (will become #st5)
UPDATE stories SET content = replace(content, '#st2', '#st_temp')
  WHERE id = '86d57f0f-727d-4ce6-8516-18aa51eaa790' AND content LIKE '%#st2%';

-- Story f2a073c6: content #st3 → #st2
UPDATE stories SET content = replace(content, '#st3', '#st2')
  WHERE id = 'f2a073c6-de12-480b-925a-9bd304ced82f' AND content LIKE '%#st3%';

-- Story ae6ee29d: content #st5 → #st3
UPDATE stories SET content = replace(content, '#st5', '#st3')
  WHERE id = 'ae6ee29d-1f57-4dcc-9567-2c9d9e87ced1' AND content LIKE '%#st5%';

-- Story 86d57f0f: #st_temp → #st5
UPDATE stories SET content = replace(content, '#st_temp', '#st5')
  WHERE id = '86d57f0f-727d-4ce6-8516-18aa51eaa790' AND content LIKE '%#st_temp%';

COMMIT;

-- Verification (run after commit — expect 0 rows):
-- SELECT id, system_tags, content FROM stories
-- WHERE id IN ('ae6ee29d-1f57-4dcc-9567-2c9d9e87ced1','86d57f0f-727d-4ce6-8516-18aa51eaa790','f2a073c6-de12-480b-925a-9bd304ced82f');
-- Each row's content #stN must match system_tags stN.
