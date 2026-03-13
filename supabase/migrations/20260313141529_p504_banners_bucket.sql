-- P504: Create banners storage bucket for auto-generated profile/story/point banners
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banners', 'banners', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- Allow service_role to insert (edge function uploads)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role can insert banners' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "service_role can insert banners"
    ON storage.objects FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'banners');
  END IF;
END $$;

-- Allow service_role to delete (cleanup old banners on regenerate)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'service_role can delete banners' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "service_role can delete banners"
    ON storage.objects FOR DELETE
    TO service_role
    USING (bucket_id = 'banners');
  END IF;
END $$;

-- Allow public read (banners displayed on public pages)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public can read banners' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "public can read banners"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'banners');
  END IF;
END $$;
