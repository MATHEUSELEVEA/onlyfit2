/**
 * Cues sonoros do player guiado (padrão NRC/timers HIIT: beep nos 3s finais,
 * beep duplo na troca de fase, tríade ao concluir). Web Audio puro — sem
 * dependência; no WKWebView o contexto destrava no primeiro gesto do usuário.
 */

let ctx: AudioContext | null = null;

/** Cria/resume o AudioContext. Chamar num handler de tap (destrava iOS). */
export function unlockCues(): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // sem áudio disponível — cues viram no-op
  }
}

function beep(frequency: number, at: number, duration: number): void {
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const start = ctx.currentTime + at;
  // Envelope curto (sem clique) e volume contido — cue, não alarme.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.22, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Beep de contagem (3…2…1). `soft` = chime grave para yoga/pilates. */
export function cueTick(soft = false): void {
  beep(soft ? 440 : 880, 0, 0.12);
}

/** Troca de fase: beep duplo ascendente. */
export function cuePhaseChange(): void {
  beep(660, 0, 0.11);
  beep(880, 0.14, 0.14);
}

/** Fim do treino: tríade. */
export function cueFinish(): void {
  beep(660, 0, 0.12);
  beep(830, 0.15, 0.12);
  beep(990, 0.3, 0.22);
}
