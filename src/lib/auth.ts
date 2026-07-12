/**
 * Normaliza e-mail para auth: trim + lowercase.
 * Garante que signup/login funcionem independente de maiúsculas ou espaços
 * acidentais (o Supabase Auth pode tratar e-mail como case-sensitive).
 * Espelha o helper homônimo do v1.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Caminho interno seguro para `redirect_to` pós-confirmação de e-mail
 * (só paths que começam com `/`, evitando open-redirect).
 */
export function sanitizeInternalRedirectPath(
  next: string | null | undefined,
  fallback = '/feed',
): string {
  const t = (next ?? '').trim();
  if (!t.startsWith('/') || t.startsWith('//')) return fallback;
  return t;
}
