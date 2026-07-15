import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Botão de voltar que retorna à tela realmente anterior (`navigate(-1)`), em vez
 * de um destino fixo. Assim, a mesma tela (ex.: Ficha de saúde) volta para onde o
 * usuário veio — Perfil ou Meu Fit.
 *
 * `fallback` é usado só quando não há histórico interno (deep link / primeira
 * rota da sessão), caso em que `location.key === 'default'`.
 */
export function BackButton({ fallback = '/perfil', label = 'Voltar' }: { fallback?: string; label?: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleBack() {
    if (location.key === 'default') {
      navigate(fallback);
    } else {
      navigate(-1);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft size={21} aria-hidden />
    </button>
  );
}
