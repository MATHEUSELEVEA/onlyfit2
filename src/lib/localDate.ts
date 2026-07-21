/**
 * Chave de dia (YYYY-MM-DD) no calendário LOCAL do device — nunca em UTC.
 *
 * Datar por UTC (`value.slice(0, 10)` ou `date.toISOString().slice(0, 10)`)
 * quebra em fusos negativos como o do Brasil (UTC-3): uma corrida às 21h vira
 * ~00h UTC do dia seguinte e cai no dia errado, criando duplicidade aparente
 * (dois treinos no mesmo dia quando o Apple Watch mostra um em cada dia).
 * Aqui usamos os getters locais do Date, que respeitam o fuso do aparelho.
 */
export function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value.slice(0, 10) : '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Chave do dia de hoje no fuso local. */
export function todayKey(): string {
  return localDateKey(new Date());
}
