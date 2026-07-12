/**
 * send-signup-confirmation
 * Cria o usuário (não confirmado) via Admin API e envia o e-mail de
 * confirmação de cadastro via Resend — mesmo padrão do `send-password-reset`.
 *
 * Por quê: o e-mail nativo de confirmação do Supabase (`supabase.auth.signUp()`)
 * monta o link com `{{ .SiteURL }}`, uma config GLOBAL do projeto (compartilhada
 * com o v1) que nenhuma variável da aplicação alcança. Usando a Admin API
 * (`generateLink`) em vez do `signUp()` client-side, nenhum e-mail nativo é
 * disparado — nós montamos e enviamos o nosso, com o domínio que o app pedir.
 *
 * Body: {
 *   email, password,
 *   metadata?: { full_name?, username?, country_code?, tax_id?, language? },
 *   base_url?: "https://app-domain"  // origem do link no e-mail (validada)
 * }
 * Env: RESEND_API_KEY, OTP_FROM_EMAIL (ex: "OnlyFit <noreply@...>")
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, resolveAppBaseUrl } from "../_shared/cors.ts";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_CONFIRM_BASE_URL = "https://onlyfitapp.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      metadata?: Record<string, unknown>;
      base_url?: string;
    };
    const email = body.email?.trim();
    const password = body.password;
    const confirmBaseUrl = resolveAppBaseUrl(body.base_url, DEFAULT_CONFIRM_BASE_URL);

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "E-mail e senha são obrigatórios." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("OTP_FROM_EMAIL") ?? "OnlyFit <noreply@onlyfit.app>";
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Envio de e-mail não configurado." }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Cria o usuário (não confirmado) e gera o link — não dispara e-mail nativo.
    // O trigger `sync_profile_contacts_from_auth_user` popula o perfil a partir
    // de `options.data`, igual ao fluxo antigo via `supabase.auth.signUp()`.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: body.metadata },
    });

    if (linkError) {
      console.error("[send-signup-confirmation] generateLink error:", linkError);

      if (linkError.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas solicitações em pouco tempo. Por favor, aguarde alguns minutos e tente novamente." }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        });
      }

      const msg = linkError.message?.toLowerCase() ?? "";
      if (linkError.status === 422 || msg.includes("already been registered") || msg.includes("already registered") || msg.includes("user_already_exists")) {
        return new Response(JSON.stringify({ error: "Este e-mail já possui cadastro. Faça login ou recupere o acesso." }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        });
      }

      return new Response(JSON.stringify({ error: "Desculpe, tivemos um problema ao criar sua conta. Por favor, tente novamente em alguns instantes." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return new Response(JSON.stringify({ error: "Erro ao obter ação de confirmação." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const actionUrl = new URL(actionLink);
    const token = actionUrl.searchParams.get("token");

    // Link próprio (mesmo padrão do reset) para não cair no filtro de spam.
    const customLink = `${confirmBaseUrl}/auth/confirm?token_hash=${token}&type=signup`;

    const subject = `Confirme seu e-mail — OnlyFit`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #020406; color: #ffffff; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #020406; }
            .header { text-align: center; margin-bottom: 40px; }
            .logo { height: 40px; margin-bottom: 20px; }
            .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; padding: 40px; text-align: center; }
            .title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em; color: rgba(34, 255, 142, 0.7); margin-bottom: 16px; }
            .subtitle { font-size: 24px; font-weight: 900; color: #ffffff; margin-bottom: 32px; letter-spacing: -0.02em; }
            .btn-container { margin: 32px 0; }
            .btn { background-color: #22FF8E; color: #020406; text-decoration: none; padding: 18px 32px; border-radius: 100px; font-weight: 900; font-size: 16px; display: inline-block; letter-spacing: -0.01em; box-shadow: 0 8px 32px rgba(34, 255, 142, 0.2); }
            .footer { text-align: center; font-size: 12px; color: rgba(255, 255, 255, 0.4); margin-top: 40px; line-height: 1.6; }
            .accent { color: #22FF8E; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://lygynazgwdxhecgceffc.supabase.co/storage/v1/object/public/assets/onlyfit_logo.png" alt="OnlyFit" class="logo">
            </div>
            <div class="card">
              <div class="title">Confirmação de Cadastro</div>
              <div class="subtitle">Falta pouco para começar</div>
              <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 32px;">Confirme seu e-mail para ativar sua conta OnlyFit.</p>

              <div class="btn-container">
                <a href="${customLink}" class="btn">Confirmar E-mail</a>
              </div>

              <p style="font-size: 12px; color: rgba(255, 255, 255, 0.4); margin-top: 24px;">Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${customLink}" style="color: rgba(34, 255, 142, 0.7); word-break: break-all;">${customLink}</a>
              </p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} OnlyFit. Todos os direitos reservados.</p>
              <p>Se você não criou esta conta, ignore este e-mail.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[send-signup-confirmation] Resend error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Conta criada, mas não conseguimos enviar o e-mail agora. Tente reenviar mais tarde." }),
        { status: 502, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    await res.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ ok: true, message: "Conta criada! Confira seu e-mail para confirmar o acesso." }),
      { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  } catch (e) {
    console.error("[send-signup-confirmation]", e);
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }
});
