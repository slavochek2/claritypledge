-- client-safe: the DROP POLICY lines only make re-runs idempotent for policies this migration creates; no deployed client uses the avatars bucket, and the widened CHECK accepts every existing value.
-- P1418: users upload their own profile picture.
-- First browser-written bucket: every earlier bucket is service_role-write only. Each signed-in
-- user may write, list and delete objects only under their own "<auth.uid()>/" folder.
-- Size and type limits are enforced here, not only in the client.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "p1418 owner can upload avatar" ON storage.objects;
CREATE POLICY "p1418 owner can upload avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- SELECT is needed for storage.remove() and list(); public URLs are served without it.
DROP POLICY IF EXISTS "p1418 owner can list avatar" ON storage.objects;
CREATE POLICY "p1418 owner can list avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "p1418 owner can delete avatar" ON storage.objects;
CREATE POLICY "p1418 owner can delete avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 'upload' = the user chose this photo; Google sign-in must not replace it.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_provider_check
  CHECK (avatar_provider IN ('google', 'generated', 'gravatar', 'upload'));
