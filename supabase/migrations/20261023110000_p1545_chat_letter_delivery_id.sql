-- diffed against: 20261023100000_p1545_artifacts_data.sql (get_chat_artifact_attachment); get_received_letters_page is a new function
-- P1545 follow-up (Codex findings 1 and 2).
--   1. The chat letter card must open the recipient's DELIVERY (/letter/:id takes a delivery id), not the letter.
--   2. get_inbox_items trims the MIXED list (letters to me + activity on my letters) to 20 rows server side
--      (LIMIT 20), so received letters fall off behind sender activity. The Artifacts page needs every letter
--      delivered to the person: get_received_letters_page pages through them, newest first, by keyset.
--
-- client-safe: get_received_letters_page is a new function nothing deployed calls. get_chat_artifact_attachment keeps its name, argument list and return type (jsonb); a letter
--   answer gains one key, 'delivery_id' (the viewer's own delivery, null when the viewer has none). A deployed
--   client ignores the extra key. Every guard of 20261023100000 stays; the body is that file's plus the
--   v_delivery lookup. Grants are restated because CREATE OR REPLACE keeps them but the pinned shape test reads them.

CREATE OR REPLACE FUNCTION public.get_chat_artifact_attachment(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas public.canvases;
  v_letter public.clarity_letters;
  v_title  text;
  v_owner  public.profiles;
  v_delivery uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'canvas' THEN
    SELECT * INTO v_canvas FROM public.canvases c WHERE c.id = p_id;
    IF FOUND AND (v_canvas.owner_id = v_uid OR public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL) THEN
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_canvas.owner_id;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'canvas', 'id', v_canvas.id, 'name', v_canvas.name,
        'owner_id', v_canvas.owner_id, 'owner_name', v_owner.name, 'owner_slug', v_owner.slug,
        'is_owner', v_canvas.owner_id = v_uid);
    END IF;
  ELSIF p_kind = 'letter' THEN
    SELECT * INTO v_letter FROM public.clarity_letters l WHERE l.id = p_id;
    IF FOUND AND v_letter.status = 'sealed'
       AND (v_letter.sender_id = v_uid
            OR EXISTS (SELECT 1 FROM public.letter_deliveries d
                        WHERE d.letter_id = v_letter.id AND d.receiver_profile_id = v_uid)) THEN
      SELECT d.title INTO v_title FROM public.clarity_docs d WHERE d.id = v_letter.source_doc_id;
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_letter.sender_id;
      -- The recipient's page is /letter/<delivery id>, not the letter id (a letter with several
      -- recipients has one delivery each). NULL for the sender who is not also a recipient.
      SELECT d.id INTO v_delivery FROM public.letter_deliveries d
       WHERE d.letter_id = v_letter.id AND d.receiver_profile_id = v_uid
       ORDER BY d.created_at, d.id LIMIT 1;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'letter', 'id', v_letter.id, 'title', v_title,
        'sender_id', v_letter.sender_id, 'sender_name', v_owner.name, 'sender_slug', v_owner.slug,
        'is_sender', v_letter.sender_id = v_uid, 'delivery_id', v_delivery);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', false, 'kind', p_kind, 'id', p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_artifact_attachment(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_artifact_attachment(text, uuid) TO authenticated;

-- ============================================================================
-- Received letters, one page at a time (Shared with you)
-- ============================================================================
-- The same rows and the same filter as get_inbox_items branch 1 (a delivery to me, not self-sent), with the
-- same SECURITY DEFINER read of the source doc title (clarity_docs RLS would hide a private doc from the
-- receiver). Keyset order is (created_at DESC, id DESC): pass the last row's timestamp and delivery_id to get
-- the next page. p_limit is clamped to 1..200.
CREATE OR REPLACE FUNCTION public.get_received_letters_page(
  p_limit     int         DEFAULT 100,
  p_before_ts timestamptz DEFAULT NULL,
  p_before_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(page.item ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT ld.created_at, ld.id,
             jsonb_build_object(
               'type',         'received',
               'delivery_id',  ld.id,
               'letter_id',    ld.letter_id,
               'title',        COALESCE(cd.title, 'Untitled'),
               'actor_name',   COALESCE(p.name, 'Someone'),
               'actor_slug',   p.slug,
               'timestamp',    ld.created_at,
               'read_at',      ld.read_at,
               'completed_at', ld.completed_at
             ) AS item
        FROM public.letter_deliveries ld
        JOIN public.clarity_letters cl ON cl.id = ld.letter_id
        JOIN public.clarity_docs cd    ON cd.id = cl.source_doc_id
        JOIN public.profiles p         ON p.id  = cl.sender_id
       WHERE ld.receiver_profile_id = v_uid
         AND cl.sender_id <> v_uid
         AND (p_before_ts IS NULL OR (ld.created_at, ld.id) < (p_before_ts, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       ORDER BY ld.created_at DESC, ld.id DESC
       LIMIT v_limit
    ) page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_received_letters_page(int, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_received_letters_page(int, timestamptz, uuid) TO authenticated;
