export type SocialPlatform = 'instagram' | 'youtube' | 'twitter' | 'tiktok' | 'whatsapp' | 'linkedin';

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_PLATFORMS: { key: SocialPlatform; label: string; prefix: string; mark: string }[] = [
  { key: 'instagram', label: 'Instagram', prefix: 'https://www.instagram.com/', mark: 'IG' },
  { key: 'youtube', label: 'YouTube', prefix: 'https://www.youtube.com/', mark: 'YT' },
  { key: 'twitter', label: 'X', prefix: 'https://x.com/', mark: 'X' },
  { key: 'tiktok', label: 'TikTok', prefix: 'https://www.tiktok.com/@', mark: 'TT' },
  { key: 'whatsapp', label: 'WhatsApp', prefix: 'https://wa.me/', mark: 'WA' },
  { key: 'linkedin', label: 'LinkedIn', prefix: 'https://www.linkedin.com/in/', mark: 'IN' },
];

const PLATFORM_KEYS = new Set<SocialPlatform>(SOCIAL_PLATFORMS.map((item) => item.key));

function cleanHandle(value: string): string {
  return value.trim().replace(/^@+/, '').replace(/^\/+/, '');
}

export function normalizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const links: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = source[platform.key];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed) links[platform.key] = trimmed;
  }
  return links;
}

export function socialLinkHref(platform: SocialPlatform, value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const config = SOCIAL_PLATFORMS.find((item) => item.key === platform);
  if (!config) return trimmed;
  if (platform === 'whatsapp') return `${config.prefix}${trimmed.replace(/\D/g, '')}`;
  return `${config.prefix}${cleanHandle(trimmed)}`;
}

export function cleanSocialLinksForSave(links: SocialLinks): SocialLinks {
  const next: SocialLinks = {};
  for (const [key, value] of Object.entries(links)) {
    if (!PLATFORM_KEYS.has(key as SocialPlatform)) continue;
    const trimmed = value?.trim();
    if (trimmed) next[key as SocialPlatform] = socialLinkHref(key as SocialPlatform, trimmed);
  }
  return next;
}
