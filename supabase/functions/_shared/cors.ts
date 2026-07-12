const DEFAULT_ALLOWED_ORIGINS = [
  "https://onlyfitapp.com",
  "https://www.onlyfitapp.com",
  "https://onlyfit.app",
  "https://www.onlyfit.app",
  "https://onlyfit.netlify.app",
  "https://onlyfit2.vercel.app",
  "capacitor://localhost",
  "ionic://localhost",
] as const;

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-token, x-internal-token";

function parseAllowedOrigins(): string[] {
  const configured = Deno.env.get("EDGE_ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGINS") ??
    "";

  return [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configured.split(",").map((origin) => origin.trim()).filter(Boolean),
  ];
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function isNetlifyPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".netlify.app");
  } catch {
    return false;
  }
}

function resolveAllowedOrigin(req?: Request): string {
  const origin = req?.headers.get("Origin") ?? "";
  const allowedOrigins = parseAllowedOrigins();

  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      isLocalDevelopmentOrigin(origin) ||
      isNetlifyPreviewOrigin(origin))
  ) {
    return origin;
  }

  return allowedOrigins[0];
}

/**
 * Valida se uma origem (ex.: a URL base vinda do app para o link de reset)
 * é confiável — mesma allowlist do CORS. Evita open-redirect / roubo de token:
 * a edge function é anônima, então NUNCA use uma URL do cliente sem validar.
 */
export function isAllowedAppOrigin(origin: string): boolean {
  if (!origin) return false;
  const allowedOrigins = parseAllowedOrigins();
  return (
    allowedOrigins.includes(origin) ||
    isLocalDevelopmentOrigin(origin) ||
    isNetlifyPreviewOrigin(origin)
  );
}

/**
 * Resolve a origem base para um link de e-mail (reset, confirmação…) a partir
 * do que a aplicação enviou no corpo da requisição. A função é anônima, então
 * NUNCA usar a URL do cliente sem validar contra a allowlist — senão um
 * atacante poderia redirecionar o token (de reset ou de confirmação) para um
 * domínio próprio. Candidato ausente/inválido/não confiável => usa `fallback`.
 */
export function resolveAppBaseUrl(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string" || !candidate.trim()) return fallback;
  try {
    const url = new URL(candidate.trim());
    if (isAllowedAppOrigin(url.origin)) return url.origin;
  } catch {
    /* URL malformada → cai no fallback */
  }
  return fallback;
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req),
    "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

// Mantido para compatibilidade com funções que recebem corsHeaders via parâmetro.
// Prefira getCorsHeaders(req) para resolução correta por request.
// @deprecated Use getCorsHeaders(req) instead.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};
