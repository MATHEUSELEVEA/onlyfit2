import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppleHealthSyncResult } from './types';

export interface OnlyFitHealthKitPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  requestPermissions(): Promise<{ granted: boolean; denied?: string[] }>;
  getAuthorizationStatus(): Promise<{ available: boolean; status: 'available' | 'unavailable' | 'unknown' }>;
  syncInitial(options: { days: number }): Promise<AppleHealthSyncResult>;
  syncDelta(options: { anchors?: Record<string, string> }): Promise<AppleHealthSyncResult>;
  disconnect(): Promise<{ disconnected: true }>;
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
  async disconnect() {
    return { disconnected: true };
  },
};

export const OnlyFitHealthKit = Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform()
  ? NativeOnlyFitHealthKit
  : unavailable;
