export const FONT_SCALE_KEY = 'onlyfit.font-scale';

export function readFontScale(): number {
  const stored = localStorage.getItem(FONT_SCALE_KEY);
  if (stored === null) return 2;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 1 && value <= 3 ? value : 2;
}

export function applyFontScale(scale: number) {
  document.documentElement.style.fontSize = `${14 + scale}px`;
  localStorage.setItem(FONT_SCALE_KEY, String(scale));
}
