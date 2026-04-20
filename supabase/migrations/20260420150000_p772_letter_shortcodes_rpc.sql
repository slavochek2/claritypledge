-- P772: resolve_letter_shortcode RPC
-- new function
-- Resolves a shortcode (e.g. "st5") to the latest sealed 1-to-many letter delivery UUID
-- for a given sender slug. SECURITY DEFINER so anon users can resolve public letter shortcodes.
CREATE OR REPLACE FUNCTION resolve_letter_shortcode(
  p_code TEXT,
  p_sender_slug TEXT
)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ld.id
  FROM clarity_letters cl
  JOIN clarity_docs cd ON cd.id = cl.source_doc_id
  JOIN letter_deliveries ld ON ld.letter_id = cl.id
  JOIN profiles p ON p.id = cl.sender_id
  WHERE LOWER(cd.title) = LOWER(p_code)
    AND p.slug = p_sender_slug
    AND cl.mode = 'one-to-many'
    AND cl.status = 'sealed'
  ORDER BY cl.sealed_at DESC
  LIMIT 1;
$$;
