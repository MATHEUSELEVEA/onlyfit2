import { Capacitor } from '@capacitor/core';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const CUSTOM_SCHEME_PREFIXES = ['com.onlyfitapp://', 'app.onlyfit.mobile://'] as const;

function appendHash(path: string, hash: string): string {
  if (!hash || hash === '#') return path;
  return `${path}${hash.startsWith('#') ? hash : `#${hash}`}`;
}

/**
 * Normaliza deep links externos para rotas internas da SPA.
 * Segurança: só aceita schemes do app e hosts controlados pela OnlyFit.
 */
export function normalizeDeepLinkToAppPath(rawUrl: string): string | null {
  try {
    const trimmed = rawUrl.trim();

    for (const prefix of CUSTOM_SCHEME_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        let rest = trimmed.slice(prefix.length);
        if (rest.startsWith('//')) rest = rest.slice(1);
        const path = rest.startsWith('/') ? rest : `/${rest}`;
        const hashIdx = path.indexOf('#');
        const withoutHash = hashIdx === -1 ? path : path.slice(0, hashIdx);
        const hash = hashIdx === -1 ? '' : path.slice(hashIdx);
        return appendHash(withoutHash || '/', hash);
      }
    }

    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    const allowedHosts = new Set([
      'mobile.onlyfitapp.com',
      'onlyfitapp.com',
      'www.onlyfitapp.com',
      'localhost',
      '127.0.0.1',
    ]);
    const vercelPreview = host.endsWith('.vercel.app');
    if (!allowedHosts.has(host) && !vercelPreview) return null;

    const path = `${url.pathname}${url.search}` || '/';
    return appendHash(path, url.hash);
  } catch {
    return null;
  }
}

/**
 * Registra abertura por Universal Link/custom scheme e renova sessão ao voltar
 * do background. Necessário para cadastro/reset no TestFlight abrirem no app.
 */
export function registerCapacitorAppBridge(navigate: NavigateFunction): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const disposers: Array<() => void> = [];

  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('appUrlOpen', ({ url }) => {
      const path = normalizeDeepLinkToAppPath(url);
      if (path) navigate(path);
    }).then((handle) => disposers.push(() => handle.remove()));

    void App.addListener('resume', () => {
      void supabase.auth.refreshSession();
    }).then((handle) => disposers.push(() => handle.remove()));

    void App.getLaunchUrl()
      .then((ret) => {
        if (!ret?.url) return;
        const path = normalizeDeepLinkToAppPath(ret.url);
        if (path) navigate(path, { replace: true });
      })
      .catch(() => undefined);
  });

  return () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
  };
}
