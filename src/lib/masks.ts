/** Formata `00000000` como `00000-000` (só quando tem 8 dígitos). */
export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.replace(/(\d{5})(\d{0,3})/, '$1-$2');
}
