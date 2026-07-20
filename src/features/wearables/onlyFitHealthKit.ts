import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativeIos } from '@/lib/nativeSecureStorage';
import type { AppleHealthSyncResult } from './types';

export interface OnlyFitHealthKitPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  requestPermissions(): Promise<{ granted: boolean; denied?: string[] }>;
  getAuthorizationStatus(): Promise<{
    available: boolean;
    status: 'available' | 'unavailable' | 'unknown';
    read_authorization_inspectable?: boolean;
    data_types?: string[];
  }>;
  syncInitial(options: { days: number }): Promise<AppleHealthSyncResult>;
  syncDelta(options: { anchors?: Record<string, string> }): Promise<AppleHealthSyncResult>;
  startBackgroundDelivery(): Promise<{ enabled: boolean; failed_types?: string[]; reason?: string }>;
  openSettings(): Promise<{ opened: boolean }>;
  disconnect(): Promise<{ disconnected: true }>;
  addListener(
    eventName: 'healthKitChanged',
    listenerFunc: (event: { data_type?: string; observed_at?: string; error?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeOnlyFitHealthKit = registerPlugin<OnlyFitHealthKitPlugin>('OnlyFitHealthKit');

const unavailable: OnlyFitHealthKitPlugin = {
  async isAvailable() {
    return { available: false, reason: 'Apple Health está disponível apenas no app iOS.' };
  },
  async requestPermissions() {
    return { granted: false, denied: ['platform'] };
  },
  async getAuthorizationStatus() {
    return { available: false, status: 'unavailable' };
  },
  async syncInitial() {
    return { activities: [], daily_summaries: [] };
  },
  async syncDelta() {
    return { activities: [], daily_summaries: [] };
  },
  async startBackgroundDelivery() {
    return { enabled: false, reason: 'Apple Health está disponível apenas no app iOS.' };
  },
  async openSettings() {
    return { opened: false };
  },
  async disconnect() {
    return { disconnected: true };
  },
  async addListener() {
    return { remove: async () => undefined };
  },
};

export const OnlyFitHealthKit = isNativeIos()
  ? NativeOnlyFitHealthKit
  : unavailable;
