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
  permission_status?: {
    status: 'granted' | 'partial' | 'denied' | 'unknown';
    denied?: string[];
    empty_data_types?: string[];
    read_authorization_inspectable?: boolean;
  };
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
  permission_status?: AppleHealthSyncResult['permission_status'];
}

export interface WearableActivity {
  id: string;
  date: string;
  title: string;
  durationMin: number;
  movingTimeMin?: number;
  surface: 'strength' | 'running' | 'cycling' | 'walking' | 'swimming' | 'functional' | 'hiit' | 'yoga' | 'pilates' | 'other';
  source: 'healthkit' | 'apple_health' | 'manual';
  provider?: string;
  engine?: AppleHealthEngine;
  activityType?: string;
  externalId?: string;
  startedAt?: string;
  endedAt?: string;
  distanceKm?: number;
  calories?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeedKmh?: number;
  averagePowerW?: number;
  weightedPowerW?: number;
  elevationM?: number;
  trainingLoad?: number;
  rpe?: number;
  sourcePayload?: Record<string, unknown>;
  importedFromWatch?: boolean;
}
