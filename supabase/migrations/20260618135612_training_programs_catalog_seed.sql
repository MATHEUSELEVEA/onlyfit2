-- MVP 6 — seed do catálogo de classe mundial (i18n: grava CHAVES, nunca texto).
-- Periodização: fases base/build/peak/taper + deload a cada 4ª semana; sobrecarga
-- progressiva (~6%/sem). Sessões guardam session_type + target estruturado.
-- Idempotente: limpa templates do sistema e regrava (version=2).
DO $$
DECLARE
  prog record;
  v_id uuid;
  w int; total_w int;
  sess jsonb;
  i int;
  v_phase text; v_factor numeric; v_deload boolean;
  v_est int;
  v_min numeric; v_km numeric;
  v_intensity jsonb;
BEGIN
  -- remove o seed antigo (MVP4, títulos PT crus) e qualquer template do sistema.
  DELETE FROM public.training_programs WHERE source = 'system';

  FOR prog IN SELECT * FROM (VALUES
    -- sport, slug, level, weeks, wsess, sort, equipment, pattern(jsonb)
    ('running','c25k','beginner',8,3,0,ARRAY['none']::text[],
      '[{"day":1,"type":"easy","zone":2,"min":25},{"day":3,"type":"intervals","zone":4,"min":28},{"day":6,"type":"long","zone":2,"min":35}]'::jsonb),
    ('running','run30','beginner',6,3,1,ARRAY['none']::text[],
      '[{"day":1,"type":"easy","zone":2,"min":20},{"day":3,"type":"fartlek","zone":3,"min":25},{"day":6,"type":"long","zone":2,"min":30}]'::jsonb),
    ('running','tenk_sub60','intermediate',10,4,10,ARRAY['none']::text[],
      '[{"day":1,"type":"easy","zone":2,"min":40},{"day":3,"type":"intervals","zone":5,"min":40},{"day":5,"type":"tempo","zone":3,"min":35},{"day":7,"type":"long","zone":2,"min":60}]'::jsonb),
    ('running','first_half','intermediate',12,4,11,ARRAY['none']::text[],
      '[{"day":1,"type":"easy","zone":2,"min":45},{"day":3,"type":"intervals","zone":4,"min":45},{"day":5,"type":"tempo","zone":3,"min":40},{"day":7,"type":"long","zone":2,"min":80}]'::jsonb),
    ('running','marathon','advanced',16,5,20,ARRAY['none']::text[],
      '[{"day":1,"type":"recovery","zone":1,"min":35},{"day":2,"type":"intervals","zone":5,"min":50},{"day":4,"type":"tempo","zone":3,"min":45},{"day":5,"type":"easy","zone":2,"min":45},{"day":7,"type":"long","zone":2,"min":110}]'::jsonb),
    ('cycling','light_base','beginner',4,3,0,ARRAY['bike']::text[],
      '[{"day":2,"type":"endurance","zone":2,"min":40},{"day":4,"type":"cadence","zone":2,"min":35},{"day":6,"type":"long_ride","zone":2,"min":60}]'::jsonb),
    ('cycling','first_30k','beginner',6,3,1,ARRAY['bike']::text[],
      '[{"day":2,"type":"endurance","zone":2,"min":45},{"day":4,"type":"sweet_spot","zone":3,"min":45},{"day":6,"type":"long_ride","zone":2,"km":25}]'::jsonb),
    ('cycling','gran_fondo_100','intermediate',10,4,10,ARRAY['bike']::text[],
      '[{"day":2,"type":"endurance","zone":2,"min":60},{"day":3,"type":"sweet_spot","zone":3,"min":60},{"day":5,"type":"threshold","zone":4,"min":50},{"day":7,"type":"long_ride","zone":2,"km":60}]'::jsonb),
    ('cycling','ftp_builder','advanced',8,4,20,ARRAY['bike']::text[],
      '[{"day":1,"type":"recovery_spin","zone":1,"min":40},{"day":2,"type":"threshold","zone":4,"min":60},{"day":4,"type":"vo2","zone":5,"min":50},{"day":6,"type":"long_ride","zone":2,"min":120}]'::jsonb),
    ('cycling','century_160','advanced',12,4,21,ARRAY['bike']::text[],
      '[{"day":2,"type":"endurance","zone":2,"min":75},{"day":3,"type":"sweet_spot","zone":3,"min":75},{"day":5,"type":"threshold","zone":4,"min":60},{"day":7,"type":"long_ride","zone":2,"km":90}]'::jsonb),
    ('triathlon','first_sprint','beginner',10,5,0,ARRAY['bike','pool']::text[],
      '[{"day":1,"type":"swim","zone":2,"min":40},{"day":2,"type":"bike","zone":2,"min":50},{"day":4,"type":"run","zone":3,"min":35},{"day":5,"type":"swim","zone":3,"min":40},{"day":7,"type":"brick","zone":3,"min":60}]'::jsonb),
    ('triathlon','olympic','intermediate',12,6,10,ARRAY['bike','pool']::text[],
      '[{"day":1,"type":"swim","zone":2,"min":50},{"day":2,"type":"bike","zone":4,"min":70},{"day":3,"type":"run","zone":4,"min":45},{"day":5,"type":"swim","zone":3,"min":50},{"day":6,"type":"bike","zone":2,"min":90},{"day":7,"type":"brick","zone":3,"min":75}]'::jsonb),
    ('triathlon','seventy3_base','advanced',16,6,20,ARRAY['bike','pool']::text[],
      '[{"day":1,"type":"swim","zone":2,"min":60},{"day":2,"type":"bike","zone":3,"min":90},{"day":3,"type":"run","zone":3,"min":55},{"day":5,"type":"swim","zone":4,"min":55},{"day":6,"type":"bike","zone":2,"min":150},{"day":7,"type":"brick","zone":3,"min":100}]'::jsonb),
    ('crossfit','onramp','beginner',4,3,0,ARRAY['gym']::text[],
      '[{"day":1,"type":"skill","rpe":5,"min":40},{"day":3,"type":"conditioning","rpe":6,"min":35},{"day":5,"type":"strength","rpe":6,"min":45}]'::jsonb),
    ('crossfit','conditioning','beginner',6,4,1,ARRAY['gym']::text[],
      '[{"day":1,"type":"strength","rpe":7,"min":45},{"day":2,"type":"metcon","rpe":8,"min":30},{"day":4,"type":"conditioning","rpe":7,"min":35},{"day":6,"type":"skill","rpe":5,"min":40}]'::jsonb),
    ('crossfit','strength_metcon','intermediate',8,5,10,ARRAY['gym']::text[],
      '[{"day":1,"type":"strength","rpe":8,"min":50},{"day":2,"type":"metcon","rpe":9,"min":30},{"day":3,"type":"emom","rpe":7,"min":30},{"day":5,"type":"strength","rpe":8,"min":50},{"day":6,"type":"for_time","rpe":9,"min":35}]'::jsonb),
    ('crossfit','competitor_rx','advanced',8,6,20,ARRAY['gym']::text[],
      '[{"day":1,"type":"strength","rpe":9,"min":60},{"day":2,"type":"metcon","rpe":9,"min":40},{"day":3,"type":"skill","rpe":7,"min":45},{"day":4,"type":"emom","rpe":8,"min":35},{"day":6,"type":"amrap","rpe":9,"min":40},{"day":7,"type":"conditioning","rpe":8,"min":40}]'::jsonb),
    ('bodybuilding','fullbody_beginner','beginner',8,3,0,ARRAY['gym']::text[],
      '[{"day":1,"type":"full_body","rpe":7,"min":50},{"day":3,"type":"full_body","rpe":7,"min":50},{"day":5,"type":"full_body","rpe":7,"min":50}]'::jsonb),
    ('bodybuilding','upper_lower','intermediate',8,4,10,ARRAY['gym']::text[],
      '[{"day":1,"type":"upper","rpe":8,"min":60},{"day":2,"type":"lower","rpe":8,"min":60},{"day":4,"type":"upper","rpe":8,"min":60},{"day":5,"type":"lower","rpe":8,"min":60}]'::jsonb),
    ('bodybuilding','hypertrophy_ppl','intermediate',12,6,11,ARRAY['gym']::text[],
      '[{"day":1,"type":"push","rpe":8,"min":60},{"day":2,"type":"pull","rpe":8,"min":60},{"day":3,"type":"legs","rpe":8,"min":60},{"day":4,"type":"push","rpe":8,"min":60},{"day":5,"type":"pull","rpe":8,"min":60},{"day":6,"type":"legs","rpe":8,"min":60}]'::jsonb),
    ('bodybuilding','powerbuilding','advanced',8,4,20,ARRAY['gym']::text[],
      '[{"day":1,"type":"strength_lift","rpe":9,"min":70},{"day":2,"type":"hypertrophy","rpe":8,"min":60},{"day":4,"type":"strength_lift","rpe":9,"min":70},{"day":5,"type":"hypertrophy","rpe":8,"min":60}]'::jsonb),
    ('bodybuilding','cutting','advanced',8,5,21,ARRAY['gym']::text[],
      '[{"day":1,"type":"push","rpe":8,"min":55},{"day":2,"type":"pull","rpe":8,"min":55},{"day":3,"type":"legs","rpe":8,"min":55},{"day":5,"type":"upper","rpe":8,"min":50},{"day":6,"type":"conditioning","rpe":7,"min":30}]'::jsonb)
  ) AS t(sport, slug, level, weeks, wsess, sort, equip, pattern)
  LOOP
    SELECT COALESCE(SUM((s->>'min')::numeric), 0)::int INTO v_est
      FROM jsonb_array_elements(prog.pattern) s;

    INSERT INTO public.training_programs
      (sport, slug, source, is_published, level, duration_weeks, weekly_sessions, equipment,
       name_i18n_key, goal_i18n_key, sort_order, version, est_minutes_per_week,
       name, goal, description)
    VALUES
      (prog.sport, prog.slug, 'system', true, prog.level, prog.weeks, prog.wsess, prog.equip,
       'programs.catalog.' || prog.slug || '.name',
       'programs.catalog.' || prog.slug || '.goal',
       prog.sort, 2, v_est,
       NULL, NULL, NULL)
    RETURNING id INTO v_id;

    total_w := prog.weeks;
    FOR w IN 1..total_w LOOP
      v_deload := (w % 4 = 0) AND (w < total_w);
      IF w > total_w - 1 THEN v_phase := 'taper';
      ELSIF w <= CEIL(total_w * 0.4) THEN v_phase := 'base';
      ELSIF w <= CEIL(total_w * 0.8) THEN v_phase := 'build';
      ELSE v_phase := 'peak';
      END IF;
      IF v_deload THEN v_phase := 'deload'; END IF;
      v_factor := CASE WHEN v_deload THEN 0.6 ELSE 1 + 0.06 * (w - 1) END;

      INSERT INTO public.training_program_weeks (program_id, week, phase, focus_i18n_key, target_minutes)
      VALUES (v_id, w, v_phase, 'sportTraining.phase.' || v_phase, ROUND(v_est * v_factor)::int);

      i := 0;
      FOR sess IN SELECT * FROM jsonb_array_elements(prog.pattern)
      LOOP
        i := i + 1;
        v_min := CASE WHEN sess ? 'min' THEN ROUND((sess->>'min')::numeric * v_factor) ELSE NULL END;
        v_km := CASE WHEN sess ? 'km' THEN ROUND((sess->>'km')::numeric * v_factor, 1) ELSE NULL END;
        v_intensity := '{}'::jsonb;
        IF sess ? 'zone' THEN v_intensity := v_intensity || jsonb_build_object('zone', (sess->>'zone')::int); END IF;
        IF sess ? 'rpe' THEN v_intensity := v_intensity || jsonb_build_object('rpe', (sess->>'rpe')::int); END IF;

        INSERT INTO public.training_program_sessions
          (program_id, week, day, session_type, title, est_minutes, position, target)
        VALUES
          (v_id, w, (sess->>'day')::int, sess->>'type', NULL,
           v_min::int, (w - 1) * 10 + i,
           jsonb_strip_nulls(jsonb_build_object(
             'intensity', v_intensity,
             'duration_min', v_min,
             'distance_km', v_km
           )));
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
