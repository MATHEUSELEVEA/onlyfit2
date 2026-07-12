CREATE OR REPLACE FUNCTION private.set_training_program_product_default_cover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_sport text;
  v_cover text;
BEGIN
  IF NEW.market_item_type IS DISTINCT FROM 'training_program' THEN
    RETURN NEW;
  END IF;

  IF nullif(trim(coalesce(NEW.cover_image_url, '')), '') IS NOT NULL
     AND nullif(trim(coalesce(NEW.thumbnail_url, '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT sport INTO v_sport
  FROM public.training_programs
  WHERE id = NEW.source_id;

  v_cover := CASE v_sport
    WHEN 'running' THEN '/assets/story_running.png'
    WHEN 'cycling' THEN '/assets/fitness_creator_workout_thumb_1771595694499.png'
    WHEN 'triathlon' THEN '/assets/editorial_performance.png'
    WHEN 'crossfit' THEN '/assets/workout_thumb.png'
    ELSE '/og-image.jpg'
  END;

  NEW.cover_image_url := coalesce(nullif(trim(coalesce(NEW.cover_image_url, '')), ''), v_cover);
  NEW.thumbnail_url := coalesce(nullif(trim(coalesce(NEW.thumbnail_url, '')), ''), NEW.cover_image_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_training_program_product_default_cover ON public.products;
CREATE TRIGGER aa_training_program_product_default_cover
  BEFORE INSERT OR UPDATE OF market_item_type, source_id, cover_image_url, thumbnail_url, is_published
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION private.set_training_program_product_default_cover();
