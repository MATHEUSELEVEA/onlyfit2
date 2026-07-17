import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.onlyfit.mobile',
  appName: 'OnlyFit',
  webDir: 'dist',
  server: {
    allowNavigation: [
      '*.supabase.co',
      '*.onlyfitapp.com',
      'onlyfitapp.com',
      'www.onlyfitapp.com',
      'mobile.onlyfitapp.com',
      '*.vercel.app',
      '*.cloudflare.com',
      '*.cloudflarestream.com',
      '*.r2.dev',
      '*.mux.com',
      'stream.mux.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#020406',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020406',
    },
  },
};

export default config;
