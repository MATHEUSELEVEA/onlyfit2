import { Play } from 'lucide-react';

export function ExerciseMediaCard({ label }: { label: string }) {
  return <button type="button" className="flex min-h-[164px] w-full items-center justify-center rounded-2xl border border-outline-variant/40 bg-surface-container text-center transition-transform active:scale-[0.99]" aria-label={`Ver demonstração: ${label}`}><div><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary"><Play size={19} fill="currentColor" /></span><p className="mt-3 font-sans text-label text-on-surface">Ver demonstração</p><p className="mt-1 font-sans text-body-sm text-on-surface-variant">{label}</p></div></button>;
}
