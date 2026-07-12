-- MVP 4 — seed de templates do sistema (idempotente por (sport, name, source='system')).
-- Gera sessões por semana programaticamente. Conteúdo curado em PT-BR (mercado primário).
DO $$
DECLARE
  tpl record;
  v_id uuid;
  w int;
  s int;
  days int[];
  d int;
  titles text[];
BEGIN
  FOR tpl IN
    SELECT * FROM (VALUES
      ('running',   '5K em 8 semanas',        'Cruzar a linha dos 5K correndo', 'beginner',     8, ARRAY[1,3,6], ARRAY['Ritmo leve','Intervalado','Longão']),
      ('running',   '10K em 10 semanas',      'Evoluir do 5K para o 10K',       'intermediate',10, ARRAY[1,3,6], ARRAY['Ritmo','Tiros','Longão']),
      ('running',   'Meia maratona',          '21K com consistência',           'advanced',    12, ARRAY[1,3,5,7], ARRAY['Ritmo','Tiros','Regenerativo','Longão']),
      ('cycling',   'Base de ciclismo',       'Construir base aeróbica',        'beginner',     6, ARRAY[2,4,6], ARRAY['Rodagem','Cadência','Volume']),
      ('triathlon', 'Sprint triathlon',       'Completar um Sprint',            'intermediate', 8, ARRAY[1,3,5,7], ARRAY['Natação','Bike','Corrida','Transição']),
      ('crossfit',  'CrossFit iniciante',     'Fundamentos e condicionamento',  'beginner',     4, ARRAY[1,3,5], ARRAY['Técnica','WOD','Força'])
    ) AS t(sport, name, goal, level, weeks, days_arr, titles_arr)
  LOOP
    SELECT id INTO v_id FROM public.training_programs
      WHERE sport = tpl.sport AND name = tpl.name AND source = 'system' LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.training_programs (sport, name, goal, level, duration_weeks, source, is_published, description)
      VALUES (tpl.sport, tpl.name, tpl.goal, tpl.level, tpl.weeks, 'system', true,
              'Programa guiado do OnlyFit. Comece e marque cada treino concluído.')
      RETURNING id INTO v_id;

      days := tpl.days_arr;
      titles := tpl.titles_arr;
      FOR w IN 1..tpl.weeks LOOP
        FOR s IN 1..array_length(days, 1) LOOP
          d := days[s];
          INSERT INTO public.training_program_sessions (program_id, week, day, title, description, position)
          VALUES (
            v_id, w, d,
            'Semana ' || w || ' · ' || titles[ ((s - 1) % array_length(titles,1)) + 1 ],
            NULL,
            (w - 1) * 10 + s
          );
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
END $$;
