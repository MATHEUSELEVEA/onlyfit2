import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { pathname } = useLocation();
  const immersiveFeed = pathname === '/feed' || pathname.startsWith('/video/');

  if (immersiveFeed) {
    return (
      <div className="feed-viewport relative overflow-hidden bg-black">
        <main className="h-full min-h-0">
          <Outlet />
        </main>
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
          <div className="pointer-events-auto mx-auto w-full feed-stage">
            <BottomNav />
          </div>
        </div>
      </div>
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
