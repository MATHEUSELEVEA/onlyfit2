-- Diet template upsert: persistir unidade/valor da quantidade + endurecer como SECURITY DEFINER.
--
-- Contexto (verificação de contrato frontend↔RPC↔DB):
--  1) O FoodSearchModal deixa o coach escolher unidade (grama, ml, scoop, colher, ...) e valor,
--     o frontend envia `quantity_unit`/`quantity_value` no payload, MAS a versão anterior do
--     `upsert_diet_plan_template_with_meals` não lia esses campos no INSERT do item — a unidade
--     era silenciosamente perdida (caía no default 'grama'/NULL) ao salvar/recarregar templates.
--  2) Alinhamento com as funções irmãs (`assert_diet_template_market_ready`,
--     `grant_purchased_diet_to_student`): passa a SECURITY DEFINER. A autorização continua
--     garantida pela guarda explícita `auth.uid() = p_coach_id` + filtros por coach_id,
--     então um coach só consegue afetar os próprios registros.

CREATE OR REPLACE FUNCTION "public"."upsert_diet_plan_template_with_meals"(
  "p_template_id" "uuid" DEFAULT NULL::"uuid",
  "p_coach_id" "uuid" DEFAULT NULL::"uuid",
  "p_name" "text" DEFAULT NULL::"text",
  "p_title" "text" DEFAULT NULL::"text",
  "p_objective" "text" DEFAULT NULL::"text",
  "p_target_calories" numeric DEFAULT NULL::numeric,
  "p_target_protein_g" numeric DEFAULT NULL::numeric,
  "p_target_carbs_g" numeric DEFAULT NULL::numeric,
  "p_target_fats_g" numeric DEFAULT NULL::numeric,
  "p_meals" "jsonb" DEFAULT '[]'::"jsonb"
) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_tid uuid := p_template_id;
  v_meal jsonb;
  v_item jsonb;
  v_meal_index int;
  v_item_index int;
  v_meal_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'coach_mismatch';
  END IF;

  IF p_coach_id IS NULL THEN
    RAISE EXCEPTION 'missing_coach';
  END IF;

  IF jsonb_typeof(COALESCE(p_meals, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_meals_payload';
  END IF;

  IF v_tid IS NOT NULL THEN
    UPDATE public.diet_plan_templates
    SET
      name = COALESCE(NULLIF(BTRIM(p_name), ''), name),
      title = NULLIF(BTRIM(p_title), ''),
      objective = NULLIF(BTRIM(p_objective), ''),
      target_calories = p_target_calories,
      target_protein_g = p_target_protein_g,
      target_carbs_g = p_target_carbs_g,
      target_fats_g = p_target_fats_g,
      version = version + 1,
      updated_at = v_now
    WHERE id = v_tid AND coach_id = p_coach_id
    RETURNING id INTO v_tid;

    IF v_tid IS NULL THEN
      RAISE EXCEPTION 'template_not_found';
    END IF;
  ELSE
    INSERT INTO public.diet_plan_templates (
      coach_id,
      name,
      title,
      objective,
      target_calories,
      target_protein_g,
      target_carbs_g,
      target_fats_g,
      version,
      updated_at
    )
    VALUES (
      p_coach_id,
      COALESCE(NULLIF(BTRIM(p_name), ''), 'Template dieta'),
      NULLIF(BTRIM(p_title), ''),
      NULLIF(BTRIM(p_objective), ''),
      p_target_calories,
      p_target_protein_g,
      p_target_carbs_g,
      p_target_fats_g,
      1,
      v_now
    )
    RETURNING id INTO v_tid;
  END IF;

  DELETE FROM public.diet_template_meals WHERE template_id = v_tid;

  FOR v_meal, v_meal_index IN
    SELECT value, ordinality::INT - 1
    FROM jsonb_array_elements(COALESCE(p_meals, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    INSERT INTO public.diet_template_meals (
      template_id,
      meal_type,
      title,
      target_time,
      order_index,
      is_critical
    )
    VALUES (
      v_tid,
      (v_meal ->> 'meal_type')::public.meal_type,
      NULLIF(BTRIM(v_meal ->> 'title'), ''),
      NULLIF(BTRIM(v_meal ->> 'target_time'), '')::TIME,
      COALESCE(NULLIF(BTRIM(v_meal ->> 'order_index'), '')::INT, v_meal_index),
      COALESCE((v_meal ->> 'is_critical')::boolean, false)
    )
    RETURNING id INTO v_meal_id;

    FOR v_item, v_item_index IN
      SELECT value, ordinality::INT - 1
      FROM jsonb_array_elements(COALESCE(v_meal -> 'items', '[]'::jsonb)) WITH ORDINALITY
    LOOP
      INSERT INTO public.diet_template_meal_items (
        template_meal_id,
        food_id,
        custom_food_name,
        quantity_g,
        quantity_unit,
        quantity_value,
        kcal,
        protein_g,
        carbs_g,
        fat_g,
        fiber_g,
        notes,
        order_index,
        substitution_group_id
      )
      VALUES (
        v_meal_id,
        CASE
          WHEN NULLIF(BTRIM(v_item ->> 'food_id'), '') IS NULL THEN NULL
          ELSE (v_item ->> 'food_id')::UUID
        END,
        NULLIF(BTRIM(v_item ->> 'custom_food_name'), ''),
        COALESCE(NULLIF(BTRIM(v_item ->> 'quantity_g'), '')::NUMERIC, 0),
        COALESCE(NULLIF(BTRIM(v_item ->> 'quantity_unit'), ''), 'grama'),
        NULLIF(BTRIM(v_item ->> 'quantity_value'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'kcal'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'protein_g'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'carbs_g'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'fat_g'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'fiber_g'), '')::NUMERIC,
        NULLIF(BTRIM(v_item ->> 'notes'), ''),
        COALESCE(NULLIF(BTRIM(v_item ->> 'order_index'), '')::INT, v_item_index),
        CASE
          WHEN NULLIF(BTRIM(v_item ->> 'substitution_group_id'), '') IS NULL THEN NULL
          ELSE (v_item ->> 'substitution_group_id')::UUID
        END
      );
    END LOOP;
  END LOOP;

  RETURN v_tid;
END;
$$;

ALTER FUNCTION "public"."upsert_diet_plan_template_with_meals"(
  "p_template_id" "uuid", "p_coach_id" "uuid", "p_name" "text", "p_title" "text",
  "p_objective" "text", "p_target_calories" numeric, "p_target_protein_g" numeric,
  "p_target_carbs_g" numeric, "p_target_fats_g" numeric, "p_meals" "jsonb"
) OWNER TO "postgres";
