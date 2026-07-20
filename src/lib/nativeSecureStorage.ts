import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SupportedStorage } from '@supabase/supabase-js';

interface OnlyFitSecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const OnlyFitSecureStorage = registerPlugin<OnlyFitSecureStoragePlugin>('OnlyFitSecureStorage');

export function isNativeIos() {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();
}

export const nativeSecureStorage: SupportedStorage = {
  async getItem(key: string) {
    const { value } = await OnlyFitSecureStorage.get({ key });
    return value;
  },
  async setItem(key: string, value: string) {
    await OnlyFitSecureStorage.set({ key, value });
  },
  async removeItem(key: string) {
    await OnlyFitSecureStorage.remove({ key });
  },
};
