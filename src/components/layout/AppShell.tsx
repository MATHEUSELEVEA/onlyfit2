import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { pathname } = useLocation();
  const immersiveFeed = pathname === '/feed' || pathname.startsWith('/video/');
  const immersiveStories = pathname.startsWith('/stories/');
  const immersiveTraining = pathname.startsWith('/meu-fit/treino/player');
  // Feed e viewer de stories compartilham a mesma status bar translúcida
  // full-bleed — o viewer não tem BottomNav (ver immersiveStories abaixo), mas
  // é tão "tela toda preta" quanto o feed.
  const fullBleed = immersiveFeed || immersiveStories;

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Fonte da verdade das zonas do feed: a altura real da BottomNav (incluindo
  // a safe area, que é padding dela). Tudo no feed deriva dessa variável —
  // mudou a nav, o layout inteiro se realinha sozinho.
  useEffect(() => {
    const root = rootRef.current;
    const nav = navRef.current;
    if (!immersiveFeed || !root || !nav) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--feed-nav-h', `${nav.offsetHeight}px`);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [immersiveFeed]);

  // No app nativo, o feed é imersivo de verdade: a status bar vira overlay
  // translúcido sobre a mídia (texto claro, já garantido pelo style DARK do
  // capacitor.config) e volta ao normal ao sair do feed.
  useEffect(() => {
    if (!fullBleed || !Capacitor.isNativePlatform()) return;
    void StatusBar.setOverlaysWebView({ overlay: true });
    return () => {
      void StatusBar.setOverlaysWebView({ overlay: false });
    };
  }, [fullBleed]);

  if (immersiveStories) {
    return (
      <main className="h-full min-h-0 bg-black">
        <Outlet />
      </main>
    );
  }

  if (immersiveFeed) {
    return (
      <div ref={rootRef} className="feed-viewport relative overflow-hidden bg-black">
        <main className="h-full min-h-0">
          <Outlet />
        </main>
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
          <div ref={navRef} className="pointer-events-auto mx-auto w-full feed-stage">
            <BottomNav immersive />
          </div>
        </div>
      </div>
    );
  }

  if (immersiveTraining) {
    return (
      <main className="h-full min-h-0">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
