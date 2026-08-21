-- P1135: agent-avatars storage bucket — avatar is a storage object, not a repo file
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agent-avatars', 'agent-avatars', true, 5242880, ARRAY['image/png']::text[])
ON CONFLICT (id) DO NOTHING;

-- Allow service_role to insert (provisioning uploads)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role can insert agent avatars' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "service_role can insert agent avatars"
    ON storage.objects FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'agent-avatars');
  END IF;
END $$;

-- Allow service_role to delete (cleanup on regenerate, decision (b))
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role can delete agent avatars' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "service_role can delete agent avatars"
    ON storage.objects FOR DELETE
    TO service_role
    USING (bucket_id = 'agent-avatars');
  END IF;
END $$;

-- Allow public read (avatars render on public agent profile pages)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public can read agent avatars' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "public can read agent avatars"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'agent-avatars');
  END IF;
END $$;
