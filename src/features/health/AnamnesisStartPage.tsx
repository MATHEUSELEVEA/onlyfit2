import { Link } from 'react-router-dom';
import { BrainCircuit, ChevronRight, ClipboardList, LockKeyhole } from 'lucide-react';
import { HealthIcon, HealthPageHeader, HealthPageShell } from './components/HealthPrimitives';

export function AnamnesisStartPage() {
  return (
    <HealthPageShell width="form">
      <HealthPageHeader
        title="Responder anamnese"
        description="Escolha como prefere responder"
        backTo="/perfil/saude"
      />
      <main className="space-y-6 px-4 py-6">
        <div>
          <h2 className="font-sans text-title text-on-surface">O conteúdo é o mesmo nos dois formatos</h2>
          <p className="mt-2 font-sans text-body text-on-surface-variant">
            Você poderá revisar todas as respostas antes de adicioná-las ao histórico.
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface">
          <Link
            to="/perfil/saude/anamnese/questionario"
            className="flex min-h-[88px] items-center gap-3 px-4 py-4 transition-colors active:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <HealthIcon icon={ClipboardList} />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-body font-semibold text-on-surface">Questionário normal</span>
              <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
                Responda por seções, sem usar inteligência artificial.
              </span>
            </span>
            <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
          </Link>
          <Link
            to="/perfil/saude/anamnese/conversa"
            className="flex min-h-[88px] items-center gap-3 border-t border-outline-variant/25 px-4 py-4 transition-colors active:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <HealthIcon icon={BrainCircuit} />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-body font-semibold text-on-surface">Conversa assistida</span>
              <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
                Uma pergunta por vez, com IA somente quando sua resposta precisar ser interpretada.
              </span>
            </span>
            <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
          </Link>
        </section>

        <div className="flex items-start gap-3 rounded-xl bg-surface-container-low px-3 py-3">
          <LockKeyhole size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden />
          <p className="font-sans text-body-sm text-on-surface-variant">
            Rascunhos não fazem parte do seu histórico. O evento imutável é criado somente após sua confirmação final.
          </p>
        </div>
      </main>
    </HealthPageShell>
  );
}
