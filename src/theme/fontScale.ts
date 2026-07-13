export const FONT_SCALE_KEY = 'onlyfit.font-scale';
export const MIN_FONT_SCALE = 1;
export const MAX_FONT_SCALE = 4;

export function readFontScale(): number {
  const stored = localStorage.getItem(FONT_SCALE_KEY);
  if (stored === null) return 2;
  const value = Number(stored);
  return Number.isFinite(value) && value >= MIN_FONT_SCALE && value <= MAX_FONT_SCALE ? value : 2;
}

export function applyFontScale(scale: number) {
  document.documentElement.style.fontSize = `${14 + scale}px`;
  localStorage.setItem(FONT_SCALE_KEY, String(scale));
}
