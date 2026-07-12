-- =============================================================================
-- 1. Hardening workout_cycles (Garantir colunas necessárias)
-- =============================================================================
ALTER TABLE public.workout_cycles
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS source_protocol_id UUID; -- Será FK para workout_protocols abaixo

-- =============================================================================
-- 2. Workout Protocols (Nível 1 - Templates Inspirados no MFIT)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.workout_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id),
  pro_id UUID REFERENCES public.profiles(id),
  tenant_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- ex: Hipertrofia, Emagrecimento
  level TEXT,    -- ex: Iniciante, Intermediário
  tags TEXT[],
  
  -- Campos inspirados no MFIT
  assignment_type TEXT DEFAULT 'day_of_week', -- ex: 'day_of_week', 'sequential' (A, B, C)
  visibility_rule TEXT DEFAULT 'always',      -- ex: 'always', 'scheduled'
  auto_archive_after_weeks INTEGER,           -- Arquivar automaticamente após X semanas
  general_guidelines TEXT,                    -- Orientações gerais do programa
  
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workout_protocol_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID REFERENCES public.workout_protocols(id) ON DELETE CASCADE,
  workout_template_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE,
  day_label TEXT, -- ex: "Segunda-Feira", "Terça-Feira", "Treino A"
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vincular FK agora que a tabela existe
ALTER TABLE public.workout_cycles
  DROP CONSTRAINT IF EXISTS fk_source_protocol,
  ADD CONSTRAINT fk_source_protocol 
    FOREIGN KEY (source_protocol_id) 
    REFERENCES public.workout_protocols(id) 
    ON DELETE SET NULL;

-- =============================================================================
-- 3. RPC: Clonagem Inteligente (Hierarquia 3 Níveis)
-- =============================================================================
CREATE OR REPLACE FUNCTION clone_protocol_for_student(
  p_protocol_id UUID,
  p_student_id UUID,
  p_coach_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_protocol RECORD;
  v_new_cycle_id UUID;
  v_item RECORD;
  v_new_workout_id UUID;
  v_exercise RECORD;
BEGIN
  -- 1. Obter info do protocolo
  SELECT * INTO v_protocol FROM public.workout_protocols WHERE id = p_protocol_id;

  -- 2. Criar novo Ciclo (Nível 1 Real para o aluno)
  INSERT INTO public.workout_cycles (
    coach_id,
    student_id,
    name,
    description,
    source_protocol_id,
    status,
    starts_at
  ) VALUES (
    p_coach_id,
    p_student_id,
    v_protocol.name,
    v_protocol.description,
    p_protocol_id,
    'active',
    CURRENT_DATE
  ) RETURNING id INTO v_new_cycle_id;

  -- 3. Clonar Treinos (Nível 2)
  FOR v_item IN 
    SELECT w.*, pi.day_label, pi.position 
    FROM public.workout_protocol_items pi
    JOIN public.workouts w ON pi.workout_template_id = w.id
    WHERE pi.protocol_id = p_protocol_id
    ORDER BY pi.position
  LOOP
    -- Criar cópia do Workout
    INSERT INTO public.workouts (
      title,
      description,
      owner_id,
      pro_id,
      tenant_id,
      workout_type,
      source_template_id,
      is_published,
      category,
      level,
      tags
    ) VALUES (
      v_item.title,
      v_item.description,
      p_student_id, 
      p_coach_id,
      v_item.tenant_id,
      'coach_plan',
      v_item.id,
      false,
      v_item.category,
      v_item.level,
      v_item.tags
    ) RETURNING id INTO v_new_workout_id;

    -- Vincular ao Ciclo do Aluno (Assignment)
    INSERT INTO public.student_workout_assignments (
      student_user_id,
      workout_id,
      cycle_id,
      source_type,
      source_id,
      status,
      starts_at
    ) VALUES (
      p_student_id,
      v_new_workout_id,
      v_new_cycle_id,
      'coach',
      p_coach_id,
      'active',
      CURRENT_DATE
    );

    -- 4. Clonar Exercícios (Nível 3)
    FOR v_exercise IN 
      SELECT * FROM public.workout_exercises WHERE workout_id = v_item.id ORDER BY position
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id,
        sets,
        reps,
        rest_seconds,
        cadence,
        notes,
        tempo_notes,
        position,
        ymove_exercise_id,
        super_set_id,
        load_meta_goal,
        rest_type
      ) VALUES (
        v_new_workout_id,
        v_exercise.sets,
        v_exercise.reps,
        v_exercise.rest_seconds,
        v_exercise.cadence,
        v_exercise.notes,
        v_exercise.tempo_notes,
        v_exercise.position,
        v_exercise.ymove_exercise_id,
        v_exercise.super_set_id,
        v_exercise.load_meta_goal,
        v_exercise.rest_type
      );
    END LOOP;
  END LOOP;

  RETURN v_new_cycle_id;
END;
$$;

-- =============================================================================
-- 4. RLS
-- =============================================================================
ALTER TABLE public.workout_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_protocol_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can focus only their protocols" ON public.workout_protocols;
CREATE POLICY "Coaches can focus only their protocols" 
  ON public.workout_protocols FOR ALL 
  USING (auth.uid() = pro_id OR auth.uid() = owner_id);

DROP POLICY IF EXISTS "Coaches can manage their protocol items" ON public.workout_protocol_items;
CREATE POLICY "Coaches can manage their protocol items" 
  ON public.workout_protocol_items FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM public.workout_protocols 
    WHERE id = workout_protocol_items.protocol_id 
    AND (pro_id = auth.uid() OR owner_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Students can view protocols assigned to them" ON public.workout_protocols;
CREATE POLICY "Students can view protocols assigned to them" 
  ON public.workout_protocols FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.workout_cycles 
    WHERE source_protocol_id = workout_protocols.id 
    AND student_id = auth.uid()
  ));
