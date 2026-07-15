import { PageTopBar } from '@/components/layout/PageTopBar';

// Dieta: orientações de alimentação para o objetivo pessoal.
// Estrutura preparada — conteúdo ainda será implementado.
export function DietPage() {
  return (
    <div className="flex h-full flex-col bg-background">
      <PageTopBar title="Dieta" backFallback="/meu-fit" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="max-w-xs font-sans text-body text-on-surface-variant">
          Orientações de alimentação para o seu objetivo. Em construção.
        </p>
      </div>
    </div>
  );
}
