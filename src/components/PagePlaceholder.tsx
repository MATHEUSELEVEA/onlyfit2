interface PagePlaceholderProps {
  title: string;
  description: string;
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pt-safe-top text-center">
      <h1 className="font-sans text-title-lg text-on-surface">{title}</h1>
      <p className="max-w-xs text-body text-on-surface-variant">{description}</p>
    </div>
  );
}
