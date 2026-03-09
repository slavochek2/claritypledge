-- Create event-banners storage bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-banners', 'event-banners', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- Allow service_role to insert (edge function uploads)
CREATE POLICY "service_role can insert event banners"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'event-banners');

-- Allow service_role to delete (cleanup old banners on regenerate)
CREATE POLICY "service_role can delete event banners"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'event-banners');

-- Allow public read (banners displayed on public event pages)
CREATE POLICY "public can read event banners"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-banners');
