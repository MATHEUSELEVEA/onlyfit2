import { SOCIAL_PLATFORMS, socialLinkHref, type SocialLinks } from '@/lib/socialLinks';

export function SocialLinksRow({ links, className = '' }: { links: SocialLinks; className?: string }) {
  const visible = SOCIAL_PLATFORMS
    .map((platform) => ({ ...platform, value: links[platform.key] }))
    .filter((item): item is typeof item & { value: string } => Boolean(item.value?.trim()));

  if (!visible.length) return null;

  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      {visible.map((item) => (
        <a
          key={item.key}
          href={socialLinkHref(item.key, item.value)}
          target="_blank"
          rel="noreferrer"
          aria-label={item.label}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant/45 bg-surface-container-lowest/70 font-sans text-counter text-on-surface-variant shadow-sm backdrop-blur-md transition-colors active:bg-surface-container-high"
        >
          {item.mark}
        </a>
      ))}
    </div>
  );
}
