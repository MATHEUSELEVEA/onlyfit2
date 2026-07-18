export function RestTimerBanner({ seconds, onSkip }: { seconds: number; onSkip: () => void }) {
  if (!seconds) return null;
  return <div className="flex items-center justify-between bg-primary-container px-5 py-2"><span className="font-sans text-counter text-on-primary-container">Descanso · {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span><button type="button" onClick={onSkip} className="min-h-9 px-2 font-sans text-counter text-on-primary-container">Pular</button></div>;
}
