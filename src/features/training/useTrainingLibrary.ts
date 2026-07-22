import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { todayKey } from '@/lib/localDate';
import { useStudentWorkouts, type WorkoutTrainingType } from './useStudentWorkouts';

/**
 * Biblioteca de treinos, estruturada em 2 níveis: TIPO de treino → QUEM PASSOU
 * (profissional ou Market). Cada autor tem protocolos (ciclos vigentes, com os
 * treinos deduplicados por nome — o mesociclo clona um workout por semana) e/ou
 * treinos avulsos. Comprados no Market entram como avulsos com badge próprio.
 * Exercícios NÃO aparecem aqui (só na execução, no Player).
 */
export interface LibraryWorkout {
  assignmentId: string;
  workoutId: string | null;
  title: string;
  trainingType: WorkoutTrainingType;
  exerciseCount: number;
  isMarket: boolean;
}

export interface LibraryProtocol {
  cycleId: string;
  name: string;
  currentWeek: number | null;
  totalWeeks: number | null;
  workouts: LibraryWorkout[];
}

export interface LibraryAuthor {
  key: string;
  name: string;
  isMarket: boolean;
  protocols: LibraryProtocol[];
  workouts: LibraryWorkout[];
}

export interface LibraryTypeGroup {
  type: WorkoutTrainingType;
  authors: LibraryAuthor[];
}

type CycleRow = {
  id: string;
  name: string | null;
  student_display_name: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_weeks: number | null;
  coach_id: string | null;
};

type ProfileRow = { id: string; full_name: string | null; username: string | null };

const TYPE_ORDER: WorkoutTrainingType[] = ['strength', 'running', 'cycling', 'walking', 'swimming', 'functional', 'hiit', 'yoga', 'pilates', 'other'];

function protocolWeeks(durationWeeks: number | null): number | null {
  // 999 é o "balde" de avulsos/comprados, não uma duração real.
  return durationWeeks && durationWeeks > 0 && durationWeeks < 999 ? durationWeeks : null;
}

function currentWeek(startsAt: string | null, totalWeeks: number | null): number | null {
  if (!startsAt) return null;
  const start = new Date(`${startsAt.slice(0, 10)}T12:00:00`).getTime();
  const now = new Date(`${todayKey()}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const week = Math.max(1, Math.floor((now - start) / (7 * 86_400_000)) + 1);
  return totalWeeks ? Math.min(week, totalWeeks) : week;
}

function mostCommonType(types: WorkoutTrainingType[]): WorkoutTrainingType {
  const count = new Map<WorkoutTrainingType, number>();
  for (const type of types) count.set(type, (count.get(type) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'strength';
}

export function useTrainingLibrary() {
  const { workouts, isLoading } = useStudentWorkouts();

  const cycleIds = useMemo(
    () => [...new Set(workouts.map((w) => w.cycleId).filter((id): id is string => Boolean(id)))],
    [workouts],
  );
  const coachIds = useMemo(
    () => [...new Set(workouts.filter((w) => w.sourceType === 'coach' && w.assignedBy).map((w) => w.assignedBy as string))],
    [workouts],
  );

  const cyclesQuery = useQuery({
    queryKey: ['workout-cycles', cycleIds],
    enabled: cycleIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_cycles')
        .select('id,name,student_display_name,status,starts_at,ends_at,duration_weeks,coach_id')
        .in('id', cycleIds);
      if (error) throw error;
      const map = new Map<string, CycleRow>();
      for (const row of (data ?? []) as CycleRow[]) map.set(row.id, row);
      return map;
    },
  });

  const coachesQuery = useQuery({
    queryKey: ['library-coaches', coachIds],
    enabled: coachIds.length > 0,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,full_name,username').in('id', coachIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of (data ?? []) as ProfileRow[]) map.set(row.id, row.full_name || row.username || '');
      return map;
    },
  });

  const cycles = cyclesQuery.data;
  const coaches = coachesQuery.data;

  const groups = useMemo<LibraryTypeGroup[]>(() => {
    if (!workouts.length) return [];
    const today = todayKey();
    const isVigente = (cycle: CycleRow | undefined) =>
      Boolean(cycle) && cycle!.status === 'active' && (!cycle!.starts_at || cycle!.starts_at.slice(0, 10) <= today) && (!cycle!.ends_at || cycle!.ends_at.slice(0, 10) >= today);

    // 1. Classifica cada treino em protocolo (ciclo vigente) ou avulso; descarta
    //    protocolos passados (não vigentes).
    const protocolBuckets = new Map<string, { cycle: CycleRow; items: LibraryWorkout[] }>();
    const looseItems: Array<LibraryWorkout & { authorKey: string; authorName: string }> = [];

    for (const w of workouts) {
      const isMarket = w.sourceType === 'market';
      const cycle = w.cycleId ? cycles?.get(w.cycleId) : undefined;
      const item: LibraryWorkout = {
        assignmentId: w.assignmentId,
        workoutId: w.workoutId,
        title: w.title,
        trainingType: w.trainingType,
        exerciseCount: w.exerciseCount,
        isMarket,
      };

      if (!isMarket && cycle && protocolWeeks(cycle.duration_weeks) !== null) {
        // Ciclo é um protocolo de verdade: só entra se vigente.
        if (!isVigente(cycle)) continue;
        const bucket = protocolBuckets.get(cycle.id) ?? { cycle, items: [] };
        if (!bucket.items.some((it) => it.title.trim().toLowerCase() === item.title.trim().toLowerCase())) {
          bucket.items.push(item);
        }
        protocolBuckets.set(cycle.id, bucket);
      } else {
        const authorKey = isMarket ? 'market' : w.assignedBy ?? 'coach';
        const authorName = isMarket ? 'Market' : (w.assignedBy && coaches?.get(w.assignedBy)) || '';
        looseItems.push({ ...item, authorKey, authorName });
      }
    }

    // 2. Monta type → author → { protocols, workouts }.
    type AuthorAcc = { key: string; name: string; isMarket: boolean; protocols: LibraryProtocol[]; workouts: LibraryWorkout[] };
    const byType = new Map<WorkoutTrainingType, Map<string, AuthorAcc>>();
    const authorAcc = (type: WorkoutTrainingType, key: string, name: string, isMarket: boolean): AuthorAcc => {
      const authors = byType.get(type) ?? new Map<string, AuthorAcc>();
      byType.set(type, authors);
      const acc = authors.get(key) ?? { key, name, isMarket, protocols: [], workouts: [] };
      if (name && !acc.name) acc.name = name;
      authors.set(key, acc);
      return acc;
    };

    for (const { cycle, items } of protocolBuckets.values()) {
      const type = mostCommonType(items.map((it) => it.trainingType));
      const key = cycle.coach_id ?? 'coach';
      const name = (cycle.coach_id && coaches?.get(cycle.coach_id)) || '';
      const total = protocolWeeks(cycle.duration_weeks);
      authorAcc(type, key, name, false).protocols.push({
        cycleId: cycle.id,
        name: cycle.student_display_name || cycle.name || 'Protocolo',
        currentWeek: currentWeek(cycle.starts_at, total),
        totalWeeks: total,
        workouts: [...items].sort((a, b) => a.title.localeCompare(b.title)),
      });
    }

    for (const item of looseItems) {
      const acc = authorAcc(item.trainingType, item.authorKey, item.authorName, item.isMarket);
      if (!acc.workouts.some((it) => it.title.trim().toLowerCase() === item.title.trim().toLowerCase())) {
        acc.workouts.push({ assignmentId: item.assignmentId, workoutId: item.workoutId, title: item.title, trainingType: item.trainingType, exerciseCount: item.exerciseCount, isMarket: item.isMarket });
      }
    }

    // 3. Ordena: tipos por ordem canônica; autores com coach antes, Market por último.
    const result: LibraryTypeGroup[] = [];
    for (const type of TYPE_ORDER) {
      const authors = byType.get(type);
      if (!authors) continue;
      const list = [...authors.values()]
        .filter((a) => a.protocols.length > 0 || a.workouts.length > 0)
        .sort((a, b) => (a.isMarket === b.isMarket ? a.name.localeCompare(b.name) : a.isMarket ? 1 : -1))
        .map((a) => ({
          key: a.key,
          name: a.name,
          isMarket: a.isMarket,
          protocols: a.protocols.sort((x, y) => x.name.localeCompare(y.name)),
          workouts: a.workouts.sort((x, y) => x.title.localeCompare(y.title)),
        }));
      if (list.length) result.push({ type, authors: list });
    }
    return result;
  }, [workouts, cycles, coaches]);

  return { groups, isLoading: isLoading || cyclesQuery.isLoading };
}
