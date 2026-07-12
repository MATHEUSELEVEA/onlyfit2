-- Expose video_url and thumb_url from exercise_library in search so the app can show R2 media.
DROP FUNCTION IF EXISTS public.rpc_search_exercises(text, text, text, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.rpc_search_exercises(
  q text,
  locale text DEFAULT 'ptbr',
  p_category text DEFAULT null,
  p_equipment text DEFAULT null,
  p_muscle text DEFAULT null,
  lim integer DEFAULT 20,
  cur_id uuid DEFAULT null
)
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  equipment text,
  primary_muscles text[],
  thumb_asset_id text,
  video_url text,
  thumb_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      el.id,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br') THEN el.name_ptbr ELSE el.name_en END AS name,
      el.category,
      el.equipment,
      el.primary_muscles,
      el.thumb_asset_id,
      el.video_url,
      el.thumb_url,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br')
        THEN ts_rank_cd(el.search_pt, websearch_to_tsquery('portuguese', coalesce(trim(q), '')))
        ELSE ts_rank_cd(el.search_en, websearch_to_tsquery('english', coalesce(trim(q), '')))
      END AS fts_rank,
      CASE WHEN lower(locale) IN ('pt','ptbr','pt-br')
        THEN (el.name_ptbr ILIKE coalesce(trim(q), '') || '%')::int
        ELSE (el.name_en ILIKE coalesce(trim(q), '') || '%')::int
      END AS prefix_match
    FROM public.exercise_library el
    WHERE
      (p_category IS NULL OR el.category = p_category)
      AND (p_equipment IS NULL OR el.equipment = p_equipment)
      AND (p_muscle IS NULL OR el.primary_muscles @> ARRAY[p_muscle])
      AND (cur_id IS NULL OR el.id > cur_id)
  ),
  ranked AS (
    SELECT
      b.*,
      (COALESCE(b.fts_rank, 0) + b.prefix_match::real * 0.5) AS rank
    FROM base b
    WHERE
      (q IS NULL OR length(trim(q)) < 2)
      OR (length(trim(q)) >= 2 AND (b.fts_rank > 0 OR b.prefix_match = 1))
      OR (length(trim(q)) >= 2 AND similarity(unaccent(b.name), unaccent(coalesce(q,''))) > 0.25)
  )
  SELECT r.id, r.name, r.category, r.equipment, r.primary_muscles, r.thumb_asset_id, r.video_url, r.thumb_url, r.rank
  FROM ranked r
  ORDER BY r.rank DESC NULLS LAST, r.id ASC
  LIMIT greatest(1, least(lim, 100));
$$;

REVOKE ALL ON FUNCTION public.rpc_search_exercises(text, text, text, text, text, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_search_exercises(text, text, text, text, text, integer, uuid) TO authenticated;
