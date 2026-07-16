const DEFAULT_PUBLIC_ORIGIN = 'https://mobile.onlyfitapp.com';

function normalizeHttpOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicAppOrigin(): string {
  const configured = normalizeHttpOrigin(import.meta.env.VITE_APP_BASE_URL);
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const current = normalizeHttpOrigin(window.location.origin);
    if (current) return current;
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

export function publicAppUrl(path = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${publicAppOrigin()}${normalizedPath}`;
}
