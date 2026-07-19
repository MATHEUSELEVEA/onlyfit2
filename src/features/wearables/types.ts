export type AppleHealthEngine = 'endurance' | 'strength' | 'recovery' | 'crossfit' | 'combat';

export interface AppleHealthActivityInput {
  provider_activity_id: string;
  sport: string;
  engine: AppleHealthEngine;
  activity_type?: string;
  title?: string;
  started_at: string;
  ended_at?: string;
  duration_s?: number;
  moving_time_s?: number;
  distance_m?: number;
  elevation_gain_m?: number;
  avg_hr?: number;
  max_hr?: number;
  avg_speed_mps?: number;
  calories?: number;
  source_payload?: Record<string, unknown>;
}

export interface AppleHealthDailySummaryInput {
  date: string;
  steps?: number;
  active_kcal?: number;
  resting_hr?: number;
  avg_hr?: number;
  max_hr?: number;
  hrv_rmssd?: number;
  sleep_minutes?: number;
  source_payload?: Record<string, unknown>;
}

export interface AppleHealthSyncResult {
  activities: AppleHealthActivityInput[];
  daily_summaries: AppleHealthDailySummaryInput[];
  anchors?: Record<string, string>;
  deleted_provider_activity_ids?: string[];
}

export interface AppleHealthIngestPayload extends AppleHealthSyncResult {
  provider: 'healthkit';
  client_event_id: string;
  device_id: string;
  app_version: string;
  share_with_coach: boolean;
  sync: {
    mode: 'initial' | 'delta' | 'manual';
    started_at: string;
    ended_at: string;
    anchors?: Record<string, string>;
  };
}

export interface WearableActivity {
  id: string;
  date: string;
  title: string;
  durationMin: number;
  surface: 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';
  source: 'healthkit' | 'apple_health' | 'manual';
  externalId?: string;
  startedAt?: string;
  distanceKm?: number;
  calories?: number;
  averageHeartRate?: number;
  elevationM?: number;
}
