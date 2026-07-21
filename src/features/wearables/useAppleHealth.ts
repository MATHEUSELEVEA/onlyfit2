import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { isNativeIos } from '@/lib/nativeSecureStorage';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { OnlyFitHealthKit } from './onlyFitHealthKit';
import { localDateKey } from '@/lib/localDate';
import type { AppleHealthIngestPayload, AppleHealthSyncResult, WearableActivity } from './types';

type HealthConnectionRow = {
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  metadata: { share_with_coach?: boolean; device_id?: string; app_version?: string } | null;
};

type ExternalActivityRow = {
  id: string;
  provider_activity_id: string | null;
  sport: string;
  title: string | null;
  started_at: string;
  duration_s: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  calories: number | null;
  source_payload: Record<string, unknown> | null;
};

type DailySummaryRow = {
  date: string;
  metrics: {
    steps?: number;
    active_kcal?: number;
    resting_hr?: number;
    avg_hr?: number;
    max_hr?: number;
    hrv_rmssd?: number;
    sleep_minutes?: number;
  } | null;
};

type WearableSyncStateRow = {
  data_type: string;
  last_anchor: string | null;
};

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'mobile-web';
const QUEUE_KEY = 'onlyfit.apple_health.ingest_queue.v1';

function canPersistOfflineQueue() {
  return !Capacitor.isNativePlatform();
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
}

function surfaceFromSport(sport: string): WearableActivity['surface'] {
  if (sport === 'running') return 'running';
  if (sport === 'cycling') return 'cycling';
  if (sport === 'walking') return 'walking';
  if (sport === 'swimming') return 'swimming';
  if (sport === 'bodybuilding' || sport === 'strength') return 'strength';
  if (sport === 'hiit') return 'hiit';
  if (sport === 'yoga') return 'yoga';
  if (sport === 'pilates') return 'pilates';
  if (sport === 'functional') return 'functional';
  return 'other';
}

function labelFromSport(sport: string) {
  return ({
    running: 'Corrida',
    cycling: 'Bike',
    walking: 'Caminhada',
    swimming: 'Natação',
    bodybuilding: 'Musculação',
    strength: 'Musculação',
    hiit: 'HIIT',
    yoga: 'Yoga',
    pilates: 'Pilates',
    functional: 'Funcional',
  } as Record<string, string>)[sport] ?? 'Atividade';
}

function isAppleWatchPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return false;
  if (payload.is_apple_watch === true || payload.device_type === 'apple_watch') return true;
  const values = [
    payload.source_name,
    payload.bundle_identifier,
    payload.device_name,
    payload.device_model,
    payload.device_manufacturer,
  ];
  return values.some((value) => typeof value === 'string' && /apple\s*watch|watch/i.test(value));
}

function toWearableActivity(row: ExternalActivityRow): WearableActivity {
  return {
    id: row.id,
    date: localDateKey(row.started_at),
    title: row.title || labelFromSport(row.sport),
    durationMin: row.duration_s ? Math.round(row.duration_s / 60) : 0,
    surface: surfaceFromSport(row.sport),
    source: 'healthkit',
    externalId: row.provider_activity_id ?? undefined,
    startedAt: row.started_at,
    distanceKm: row.distance_m ? Math.round((row.distance_m / 1000) * 10) / 10 : undefined,
    calories: row.calories ? Math.round(row.calories) : undefined,
    averageHeartRate: row.avg_hr ? Math.round(row.avg_hr) : undefined,
    elevationM: row.elevation_gain_m ? Math.round(row.elevation_gain_m) : undefined,
    importedFromWatch: isAppleWatchPayload(row.source_payload),
  };
}

function readQueuedPayloads(): AppleHealthIngestPayload[] {
  if (!canPersistOfflineQueue()) return [];
  try {
    const raw = globalThis.localStorage?.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) as AppleHealthIngestPayload[] : [];
  } catch {
    return [];
  }
}

function writeQueuedPayloads(payloads: AppleHealthIngestPayload[]) {
  if (!canPersistOfflineQueue()) return;
  try {
    globalThis.localStorage?.setItem(QUEUE_KEY, JSON.stringify(payloads.slice(-10)));
  } catch {
    // Best-effort queue. Storage can be unavailable in private mode.
  }
}

function hasAppleHealthData(result: AppleHealthSyncResult) {
  return result.activities.length > 0 || result.daily_summaries.length > 0;
}

export function useAppleHealth() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const didAutoSync = useRef(false);
  const backgroundSyncTimer = useRef<number | null>(null);
  const [shareWithCoach, setShareWithCoach] = useState(true);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const availability = useQuery({
    queryKey: ['apple-health', 'availability'],
    queryFn: () => OnlyFitHealthKit.isAvailable(),
    staleTime: Infinity,
  });

  const connection = useQuery({
    queryKey: ['apple-health', 'connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('health_connections')
        .select('status,last_sync_at,last_error,metadata')
        .eq('provider', 'healthkit')
        .maybeSingle();
      if (error) throw error;
      const row = data as HealthConnectionRow | null;
      if (typeof row?.metadata?.share_with_coach === 'boolean') setShareWithCoach(row.metadata.share_with_coach);
      return row;
    },
  });

  const activities = useQuery({
    queryKey: ['apple-health', 'activities', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_activities')
        .select('id,provider_activity_id,sport,title,started_at,duration_s,distance_m,elevation_gain_m,avg_hr,calories,source_payload')
        .eq('provider', 'healthkit')
        .is('deleted_at', null)
        .order('started_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return ((data ?? []) as ExternalActivityRow[]).map(toWearableActivity);
    },
  });

  const dailySummaries = useQuery({
    queryKey: ['apple-health', 'daily-summaries', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wearable_samples_agg')
        .select('date,metrics')
        .eq('provider', 'healthkit')
        .order('date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as DailySummaryRow[];
    },
  });

  const syncState = useQuery({
    queryKey: ['apple-health', 'sync-state', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wearable_sync_state')
        .select('data_type,last_anchor')
        .eq('provider', 'healthkit');
      if (error) throw error;
      return ((data ?? []) as WearableSyncStateRow[]).reduce<Record<string, string>>((anchors, row) => {
        if (row.data_type && row.last_anchor) anchors[row.data_type] = row.last_anchor;
        return anchors;
      }, {});
    },
  });

  const ingest = useCallback(async (mode: AppleHealthIngestPayload['sync']['mode'], result: AppleHealthSyncResult) => {
    const now = new Date().toISOString();
    const payload: AppleHealthIngestPayload = {
      provider: 'healthkit',
      client_event_id: randomId(),
      device_id: 'ios-healthkit',
      app_version: APP_VERSION,
      share_with_coach: shareWithCoach,
      sync: {
        mode,
        started_at: now,
        ended_at: new Date().toISOString(),
        anchors: result.anchors,
      },
      permission_status: result.permission_status,
      activities: result.activities,
      daily_summaries: result.daily_summaries,
      deleted_provider_activity_ids: result.deleted_provider_activity_ids,
    };
    try {
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        counts?: { inserted?: number; updated?: number; summaries?: number; deleted?: number };
        error?: string;
      }>('wearables-ingest', { body: payload });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || t('health.apple.ingestError'));
      return data;
    } catch (error) {
      if (!globalThis.navigator?.onLine && canPersistOfflineQueue()) {
        writeQueuedPayloads([...readQueuedPayloads(), payload]);
        setLastSyncMessage(t('health.apple.offlineQueued'));
      }
      throw error;
    }
  }, [shareWithCoach, t]);

  const flushQueue = useCallback(async () => {
    const queue = readQueuedPayloads();
    if (!queue.length || !globalThis.navigator?.onLine) return;
    const remaining: AppleHealthIngestPayload[] = [];
    for (const payload of queue) {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean }>('wearables-ingest', { body: payload });
      if (error || !data?.success) remaining.push(payload);
    }
    writeQueuedPayloads(remaining);
    if (remaining.length < queue.length) {
      setLastSyncMessage(t('health.apple.queueFlushed', { count: queue.length - remaining.length }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'connection', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'activities', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'daily-summaries', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'sync-state', userId] }),
      ]);
    }
  }, [queryClient, t, userId]);

  const sync = useMutation({
    mutationFn: async (mode: 'initial' | 'manual' = 'manual') => {
      if (!userId) throw new Error(t('health.apple.loginRequired'));
      const available = await OnlyFitHealthKit.isAvailable();
      if (!available.available) throw new Error(available.reason || t('health.apple.unavailable'));
      const permission = await OnlyFitHealthKit.requestPermissions();
      if (!permission.granted) throw new Error(t('health.apple.permissionDenied'));
      const result = mode === 'initial'
        ? await OnlyFitHealthKit.syncInitial({ days: 90 })
        : await OnlyFitHealthKit.syncDelta({ anchors: syncState.data ?? {} });
      if (mode === 'initial' && !hasAppleHealthData(result)) {
        throw new Error(t('health.apple.noDataReturned'));
      }
      const response = await ingest(mode, result);
      if (mode === 'initial') {
        await OnlyFitHealthKit.startBackgroundDelivery();
      }
      const count = response.counts?.inserted ?? 0;
      const updated = response.counts?.updated ?? 0;
      setLastSyncMessage(t('health.apple.syncResult', { inserted: count, updated }));
      return response;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'connection', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'activities', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'daily-summaries', userId] }),
        queryClient.invalidateQueries({ queryKey: ['apple-health', 'sync-state', userId] }),
      ]);
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await OnlyFitHealthKit.disconnect();
      const { error } = await supabase
        .from('health_connections')
        .upsert({
          user_id: userId,
          provider: 'healthkit',
          status: 'disconnected',
          scopes: [],
          metadata: { share_with_coach: false },
        }, { onConflict: 'user_id,provider' });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apple-health', 'connection', userId] });
    },
  });

  useEffect(() => {
    if (didAutoSync.current) return;
    if (!userId || !availability.data?.available || connection.data?.status !== 'connected') return;
    didAutoSync.current = true;
    sync.mutate('manual');
  }, [availability.data?.available, connection.data?.status, sync, userId]);

  useEffect(() => {
    if (!userId || !availability.data?.available || connection.data?.status !== 'connected') return undefined;
    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;

    void OnlyFitHealthKit.startBackgroundDelivery();
    void OnlyFitHealthKit.addListener('healthKitChanged', () => {
      if (removed || sync.isPending) return;
      if (backgroundSyncTimer.current) window.clearTimeout(backgroundSyncTimer.current);
      backgroundSyncTimer.current = window.setTimeout(() => {
        backgroundSyncTimer.current = null;
        sync.mutate('manual');
      }, 3000);
    }).then((listener) => {
      handle = listener;
    });

    return () => {
      removed = true;
      if (backgroundSyncTimer.current) {
        window.clearTimeout(backgroundSyncTimer.current);
        backgroundSyncTimer.current = null;
      }
      void handle?.remove();
    };
  }, [availability.data?.available, connection.data?.status, sync, userId]);

  useEffect(() => {
    if (!canPersistOfflineQueue()) {
      globalThis.localStorage?.removeItem(QUEUE_KEY);
      return undefined;
    }
    const initialFlush = window.setTimeout(() => void flushQueue(), 0);
    globalThis.addEventListener?.('online', flushQueue);
    return () => {
      window.clearTimeout(initialFlush);
      globalThis.removeEventListener?.('online', flushQueue);
    };
  }, [flushQueue]);

  const progress = useMemo(() => {
    const rows = dailySummaries.data ?? [];
    const steps = rows.reduce((sum, row) => sum + (row.metrics?.steps ?? 0), 0);
    const activeKcal = rows.reduce((sum, row) => sum + (row.metrics?.active_kcal ?? 0), 0);
    const sleepRows = rows.filter((row) => row.metrics?.sleep_minutes);
    const avgSleepMinutes = sleepRows.length
      ? Math.round(sleepRows.reduce((sum, row) => sum + (row.metrics?.sleep_minutes ?? 0), 0) / sleepRows.length)
      : null;
    return { steps, activeKcal, avgSleepMinutes };
  }, [dailySummaries.data]);

  return {
    available: availability.data?.available ?? false,
    availabilityReason: availability.data?.reason,
    isNativeIos: isNativeIos(),
    connection: connection.data,
    importedActivities: activities.data ?? [],
    dailySummaries: dailySummaries.data ?? [],
    progress,
    shareWithCoach,
    setShareWithCoach,
    sync,
    disconnect,
    lastSyncMessage,
    isLoading: availability.isLoading || connection.isLoading || activities.isLoading || syncState.isLoading,
  };
}
