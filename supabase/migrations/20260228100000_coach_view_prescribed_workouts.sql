-- Coaches can view workouts they prescribed (pro_id = auth.uid())
-- Fixes: cronograma shows protocol but treinos don't appear in day cells
-- because Workouts visibility RLS only allowed owner, entitlement, or student assignments
DROP POLICY IF EXISTS "Coaches can view their prescribed workouts" ON public.workouts;
CREATE POLICY "Coaches can view their prescribed workouts"
ON public.workouts FOR SELECT
USING (auth.uid() = pro_id);
