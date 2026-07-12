INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-media',
  'business-media',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_insert'
  ) THEN
    CREATE POLICY business_media_owner_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_select'
  ) THEN
    CREATE POLICY business_media_owner_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_update'
  ) THEN
    CREATE POLICY business_media_owner_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      )
      WITH CHECK (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'business_media_owner_delete'
  ) THEN
    CREATE POLICY business_media_owner_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'business-media'
        AND (storage.foldername(name))[1] = (select auth.uid())::text
      );
  END IF;
END $$;
