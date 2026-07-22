import type { CSSProperties } from 'react';

export type MediaFramingFit = 'contain' | 'cover';

export interface MediaFraming {
  fit: MediaFramingFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_MEDIA_FRAMING: MediaFraming = {
  fit: 'contain',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const MAX_OFFSET = 80;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeMediaFraming(value: unknown): MediaFraming | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const fit = raw.fit === 'cover' ? 'cover' : 'contain';
  const zoom = typeof raw.zoom === 'number' ? raw.zoom : DEFAULT_MEDIA_FRAMING.zoom;
  const offsetX = typeof raw.offsetX === 'number' ? raw.offsetX : DEFAULT_MEDIA_FRAMING.offsetX;
  const offsetY = typeof raw.offsetY === 'number' ? raw.offsetY : DEFAULT_MEDIA_FRAMING.offsetY;

  return {
    fit,
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    offsetX: clamp(offsetX, -MAX_OFFSET, MAX_OFFSET),
    offsetY: clamp(offsetY, -MAX_OFFSET, MAX_OFFSET),
  };
}

export function mediaFramingStyle(framing: MediaFraming | null | undefined): CSSProperties {
  const safe = sanitizeMediaFraming(framing) ?? DEFAULT_MEDIA_FRAMING;
  return {
    objectFit: safe.fit,
    transform: `translate3d(${safe.offsetX}%, ${safe.offsetY}%, 0) scale(${safe.zoom})`,
    transformOrigin: 'center',
  };
}

export function updateMediaFraming(
  current: MediaFraming | null | undefined,
  patch: Partial<MediaFraming>,
): MediaFraming {
  return sanitizeMediaFraming({ ...(sanitizeMediaFraming(current) ?? DEFAULT_MEDIA_FRAMING), ...patch }) ?? DEFAULT_MEDIA_FRAMING;
}
