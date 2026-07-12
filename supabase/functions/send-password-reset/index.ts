/**
 * send-password-reset
 * Generates a password recovery link using Supabase Admin API and sends it via Resend.
 * Body: { email: "user@example.com", base_url?: "https://app-domain" }
 *   base_url = origem do link `/reset-password` no e-mail, enviada pela aplicação
 *   (variável de ambiente do front, ex.: VITE_PASSWORD_RESET_BASE_URL). É validada
 *   contra a allowlist; se ausente/vazia/não confiável, cai no padrão do v1.
 * Env: RESEND_API_KEY, OTP_FROM_EMAIL (ex: "OnlyFit <noreply@...>")
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders, resolveAppBaseUrl } from "../_shared/cors.ts";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_RESET_BASE_URL = "https://onlyfitapp.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; base_url?: string };
    const email = body.email?.trim();
    const resetBaseUrl = resolveAppBaseUrl(body.base_url, DEFAULT_RESET_BASE_URL);

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail é obrigatório." }), {
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

    // Use Service Role to generate link securely
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Generate native recovery link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
    });

    if (linkError) {
      console.error("[send-password-reset] generateLink error:", linkError);

      if (linkError.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas solicitações em pouco tempo. Por favor, aguarde alguns minutos e tente novamente." }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        });
      }

      // se nao encontrou email, podemos soltar erro genérico pra não expor user enumeration, ou erro real amigável
      if (linkError.status === 404 || linkError.message.includes("User not found")) {
         return new Response(JSON.stringify({ error: "Se o e-mail estiver cadastrado, enviaremos o link de recuperação. Verifique sua caixa de entrada." }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
          });
      }

      return new Response(JSON.stringify({ error: "Desculpe, tivemos um problema ao gerar seu link de acesso. Por favor, tente novamente em alguns instantes." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return new Response(JSON.stringify({ error: "Erro ao obter ação de recuperação." }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const subject = `Recuperação de Senha — OnlyFit`;
    const actionUrl = new URL(actionLink);
    const token = actionUrl.searchParams.get("token");

    // Constrói um link nativo do frontend para não cair no filtro de spam.
    // A origem vem do app (body.base_url, validado) ou o domínio padrão do v1.
    const customLink = `${resetBaseUrl}/reset-password?token_hash=${token}&type=recovery`;

    // Premium email template
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
              <div class="title">Recuperação de Senha</div>
              <div class="subtitle">Redefina seu acesso</div>
              <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 32px;">Recebemos uma solicitação para redefinir a senha da sua conta OnlyFit.</p>

              <div class="btn-container">
                <a href="${customLink}" class="btn">Redefinir Minha Senha</a>
              </div>

              <p style="font-size: 12px; color: rgba(255, 255, 255, 0.4); margin-top: 24px;">Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${customLink}" style="color: rgba(34, 255, 142, 0.7); word-break: break-all;">${customLink}</a>
              </p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} OnlyFit. Todos os direitos reservados.</p>
              <p>Se você não solicitou a redefinição, ignore este e-mail. Sua senha atual permanecerá a mesma.</p>
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
      console.error("[send-password-reset] Resend error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Não conseguimos enviar o e-mail agora. Por favor, verifique sua conexão ou tente novamente mais tarde." }),
        { status: 502, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
      );
    }

    await res.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ ok: true, message: "Tudo pronto! Enviamos o link de recuperação para o seu e-mail." }),
      { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  } catch (e) {
    console.error("[send-password-reset]", e);
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }
});
