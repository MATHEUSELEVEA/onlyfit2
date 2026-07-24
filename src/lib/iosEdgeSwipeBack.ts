import { Capacitor } from '@capacitor/core';
import type { NavigateFunction } from 'react-router-dom';

const EDGE_PX = 24;
const TRIGGER_PX = 72;
const MAX_VERTICAL_DRIFT_PX = 80;

function hasInternalHistory(): boolean {
  const historyIndex = Number(window.history.state?.idx);
  return Number.isFinite(historyIndex) ? historyIndex > 0 : window.history.length > 1;
}

export function registerIosEdgeSwipeBack(navigate: NavigateFunction): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return () => {};

  let startX: number | null = null;
  let startY = 0;
  let fired = false;

  function reset() {
    startX = null;
    startY = 0;
    fired = false;
  }

  function onTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch || touch.clientX > EDGE_PX) {
      reset();
      return;
    }
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select, button, a, [role="slider"]')) {
      reset();
      return;
    }
    startX = touch.clientX;
    startY = touch.clientY;
    fired = false;
  }

  function onTouchMove(event: TouchEvent) {
    if (startX === null || fired) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = Math.abs(touch.clientY - startY);
    if (dy > MAX_VERTICAL_DRIFT_PX) {
      reset();
      return;
    }
    if (dx >= TRIGGER_PX && hasInternalHistory()) {
      fired = true;
      navigate(-1);
    }
  }

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', reset, { passive: true });
  window.addEventListener('touchcancel', reset, { passive: true });

  return () => {
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', reset);
    window.removeEventListener('touchcancel', reset);
  };
}
