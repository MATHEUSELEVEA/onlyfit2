import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Botão de voltar que retorna à tela realmente anterior (`navigate(-1)`), em vez
 * de um destino fixo. Assim, a mesma tela (ex.: Ficha de saúde) volta para onde o
 * usuário veio — Perfil ou Meu Fit.
 *
 * `fallback` é usado só quando não há histórico interno (deep link / primeira
 * rota da sessão), caso em que `location.key === 'default'`.
 */
export function BackButton({
  fallback = '/perfil',
  label = 'Voltar',
  onBack,
  overMedia = false,
}: {
  fallback?: string;
  label?: string;
  onBack?: () => void;
  overMedia?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    const historyIndex = Number(window.history.state?.idx);
    const hasInternalHistory = Number.isFinite(historyIndex)
      ? historyIndex > 0
      : location.key !== 'default';
    if (hasInternalHistory) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={clsx(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
        overMedia
          ? 'text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)] active:bg-black/25 focus-visible:ring-white/80'
          : 'text-on-surface active:bg-surface-container-high focus-visible:ring-primary',
      )}
    >
      <ArrowLeft size={21} aria-hidden />
    </button>
  );
}
