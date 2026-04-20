-- fix(p772): return clarity_letters.id not letter_deliveries.id
-- diffed against: 20260420150000_p772_letter_shortcodes_rpc.sql
-- /letter/:id expects the letter_id (clarity_letters.id) for one-to-many public letters,
-- not a delivery_id. The original RPC joined letter_deliveries unnecessarily.
CREATE OR REPLACE FUNCTION resolve_letter_shortcode(
  p_code TEXT,
  p_sender_slug TEXT
)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cl.id
  FROM clarity_letters cl
  JOIN clarity_docs cd ON cd.id = cl.source_doc_id
  JOIN profiles p ON p.id = cl.sender_id
  WHERE LOWER(cd.title) = LOWER(p_code)
    AND p.slug = p_sender_slug
    AND cl.mode = 'one-to-many'
    AND cl.status = 'sealed'
  ORDER BY cl.sealed_at DESC
  LIMIT 1;
$$;
