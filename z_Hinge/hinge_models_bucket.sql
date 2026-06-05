-- ============================================================================
-- Storage bucket + RLS policies for hinge combined-GLB uploads.
-- Run once in the Supabase SQL editor. Idempotent (safe to re-run).
-- Mirrors the slide-models bucket: public read, authenticated write.
-- ============================================================================

-- 1. Create the bucket (public so getPublicUrl serves the GLB to the viewer).
INSERT INTO storage.buckets (id, name, public)
VALUES ('hinge-models', 'hinge-models', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Policies on storage.objects scoped to this bucket.
--    "new row violates row-level security policy" on upload = the INSERT policy
--    below was missing.
DROP POLICY IF EXISTS "hinge-models public read"          ON storage.objects;
DROP POLICY IF EXISTS "hinge-models authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "hinge-models authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "hinge-models authenticated delete" ON storage.objects;

CREATE POLICY "hinge-models public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'hinge-models');

CREATE POLICY "hinge-models authenticated insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hinge-models');

CREATE POLICY "hinge-models authenticated update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'hinge-models')
  WITH CHECK (bucket_id = 'hinge-models');

CREATE POLICY "hinge-models authenticated delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'hinge-models');
