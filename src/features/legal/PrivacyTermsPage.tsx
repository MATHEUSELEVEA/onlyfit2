import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import type { LegalDocument } from './legalDocuments';
import {
  useAcceptLegalDocument,
  useLegalAcceptances,
  useLegalDocuments,
  type LegalAcceptance,
} from './useLegalAcceptances';

type LegalStatus = 'accepted' | 'pending' | 'new_version';

interface LegalDocumentState {
  document: LegalDocument;
  currentAcceptance: LegalAcceptance | null;
  latestAcceptance: LegalAcceptance | null;
  status: LegalStatus;
}

export function PrivacyTermsPage() {
  const { language } = useTranslation();
  const [selectedKey, setSelectedKey] = useState('');
  const [checkedByKey, setCheckedByKey] = useState<Record<string, boolean>>({});
  const {
    data: legalDocuments = [],
    isLoading: isLoadingDocuments,
    isError: isDocumentsError,
    refetch: refetchDocuments,
  } = useLegalDocuments();
  const documentKeys = useMemo(
    () => legalDocuments.map((document) => document.key),
    [legalDocuments],
  );
  const {
    data: acceptances = [],
    isLoading: isLoadingAcceptances,
    isError: isAcceptancesError,
    refetch: refetchAcceptances,
  } = useLegalAcceptances(documentKeys);
  const acceptMutation = useAcceptLegalDocument();

  const documents = useMemo<LegalDocumentState[]>(
    () =>
      legalDocuments.map((document) => {
        const matching = acceptances.filter((acceptance) => acceptance.documentKey === document.key);
        const currentAcceptance =
          matching.find((acceptance) => acceptance.version === document.version) ?? null;
        return {
          document,
          currentAcceptance,
          latestAcceptance: matching[0] ?? null,
          status: currentAcceptance ? 'accepted' : matching.length > 0 ? 'new_version' : 'pending',
        };
      }),
    [acceptances, legalDocuments],
  );

  const selected = documents.find((item) => item.document.key === selectedKey) ?? documents[0];
  const pendingCount = documents.filter((item) => item.status !== 'accepted').length;
  const acceptedCount = documents.length - pendingCount;
  const isSelectedAccepted = selected?.status === 'accepted';
  const selectedChecked = selected ? checkedByKey[selected.document.key] === true : false;
  const isLoading = isLoadingDocuments || isLoadingAcceptances;
  const isError = isDocumentsError || isAcceptancesError;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [language],
  );

  async function acceptSelectedDocument() {
    if (!selected || isSelectedAccepted || !selectedChecked || acceptMutation.isPending) return;
    await acceptMutation.mutateAsync(selected.document);
    setCheckedByKey((current) => ({ ...current, [selected.document.key]: false }));
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[920px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        <header className="sticky top-0 z-20 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil"
              aria-label="Voltar para o perfil"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">
                Privacidade e Termos
              </h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                Consulte os documentos vigentes e registre os aceites obrigatórios.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <SummaryTile icon={Clock3} label="Pendentes" value={String(pendingCount)} />
            <SummaryTile icon={ShieldCheck} label="Assinados" value={String(acceptedCount)} />
          </div>
        </header>

        <main className="grid gap-4 px-4 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            <div className="flex items-start gap-3 px-4 py-4">
              <IconChip icon={FileText} />
              <div className="min-w-0">
                <h2 className="font-sans text-body font-semibold text-on-surface">
                  Documentos vigentes
                </h2>
                <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                  Um novo PDF ou versão exige novo aceite.
                </p>
              </div>
            </div>

            <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
              {isLoading ? (
                <LoadingBlock />
              ) : (
                documents.map((item) => (
                  <DocumentListButton
                    key={item.document.key}
                    item={item}
                    selected={item.document.key === selected?.document.key}
                    onClick={() => setSelectedKey(item.document.key)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            {!selected ? (
              <EmptyBlock />
            ) : (
              <>
                <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-sans text-title text-on-surface">
                        {selected.document.title}
                      </h2>
                      <StatusPill status={selected.status} />
                    </div>
                    <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                      Versão {selected.document.version}
                    </p>
                    <p className="mt-3 max-w-[68ch] font-sans text-body text-on-surface-variant">
                      {selected.document.description}
                    </p>
                  </div>
                  {selected.currentAcceptance && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-container px-3 py-1 font-sans text-counter text-on-primary-container">
                      <LockKeyhole size={14} aria-hidden />
                      Imutável
                    </span>
                  )}
                </div>

                {isError && (
                  <div className="border-t border-outline-variant/25 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        void refetchDocuments();
                        void refetchAcceptances();
                      }}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full bg-error-container px-4 font-sans text-label text-on-error-container"
                    >
                      <TriangleAlert size={16} aria-hidden />
                      Tentar carregar novamente
                    </button>
                  </div>
                )}

                <div className="border-t border-outline-variant/25 px-4 py-4">
                  <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
                    <iframe
                      title={`PDF - ${selected.document.title}`}
                      src={selected.document.pdfPath}
                      className="h-[58vh] min-h-[420px] w-full bg-surface-container-lowest"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={selected.document.pdfPath}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low sm:flex-none"
                    >
                      <ExternalLink size={16} aria-hidden />
                      Abrir PDF
                    </a>
                    <a
                      href={selected.document.pdfPath}
                      download
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low sm:flex-none"
                    >
                      <Download size={16} aria-hidden />
                      Baixar
                    </a>
                  </div>
                </div>

                <div className="border-t border-outline-variant/25 px-4 py-4">
                  {selected.currentAcceptance ? (
                    <AcceptedNotice
                      acceptedAt={dateFormatter.format(new Date(selected.currentAcceptance.acceptedAt))}
                    />
                  ) : (
                    <div className="space-y-4">
                      {selected.status === 'new_version' && selected.latestAcceptance && (
                        <p className="rounded-xl bg-surface-container-low px-3 py-3 font-sans text-body-sm text-on-surface-variant">
                          Você já havia registrado uma versão anterior. Esta versão exige nova confirmação.
                        </p>
                      )}

                      <label className="flex items-start gap-3 rounded-xl border border-outline-variant/40 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedChecked}
                          onChange={(event) =>
                            setCheckedByKey((current) => ({
                              ...current,
                              [selected.document.key]: event.target.checked,
                            }))
                          }
                          className="mt-1 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
                        />
                        <span className="font-sans text-body text-on-surface">
                          {selected.document.checkboxLabel}
                        </span>
                      </label>

                      {acceptMutation.isError && (
                        <p role="alert" className="font-sans text-body-sm text-error">
                          Não foi possível registrar agora. Tente novamente.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={acceptSelectedDocument}
                        disabled={!selectedChecked || acceptMutation.isPending}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
                      >
                        {acceptMutation.isPending ? (
                          <Loader2 size={17} className="animate-spin" aria-hidden />
                        ) : (
                          <Check size={17} aria-hidden />
                        )}
                        {selected.document.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function DocumentListButton({
  item,
  selected,
  onClick,
}: {
  item: LegalDocumentState;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex w-full items-start gap-3 px-4 py-4 text-left transition-colors active:bg-surface-container-low',
        selected && 'bg-surface-container-low',
      )}
    >
      <StatusIcon status={item.status} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-sans text-body font-semibold text-on-surface">
            {item.document.title}
          </span>
          <StatusPill status={item.status} />
        </span>
        <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
          Versão {item.document.version}
        </span>
      </span>
    </button>
  );
}

function StatusIcon({ status }: { status: LegalStatus }) {
  if (status === 'accepted') {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <CheckCircle2 size={19} aria-hidden />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
      <Clock3 size={19} aria-hidden />
    </span>
  );
}

function StatusPill({ status }: { status: LegalStatus }) {
  const label =
    status === 'accepted' ? 'Assinado' : status === 'new_version' ? 'Nova versão pendente' : 'Pendente';

  return (
    <span
      className={clsx(
        'inline-flex min-h-6 items-center rounded-full px-2.5 font-sans text-counter',
        status === 'accepted'
          ? 'bg-primary-container text-on-primary-container'
          : 'bg-error-container text-on-error-container',
      )}
    >
      {label}
    </span>
  );
}

function AcceptedNotice({ acceptedAt }: { acceptedAt: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary-container px-3 py-3 text-on-primary-container">
      <LockKeyhole size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-sans text-body font-semibold">Aceite registrado em {acceptedAt}</p>
        <p className="mt-1 font-sans text-body-sm">
          Esta confirmação não pode ser alterada. Se o documento mudar, uma nova versão aparecerá como pendente.
        </p>
      </div>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3 rounded-2xl bg-surface px-3 py-3 ring-1 ring-outline-variant/30">
      <IconChip icon={Icon} />
      <span className="min-w-0">
        <span className="block font-sans text-title-lg leading-none text-on-surface">{value}</span>
        <span className="mt-1 block truncate font-sans text-counter text-on-surface-variant">
          {label}
        </span>
      </span>
    </div>
  );
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[210px] items-center justify-center px-6 py-8">
      <Loader2 size={22} className="animate-spin text-primary" aria-label="Carregando" />
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-8 text-center">
      <IconChip icon={FileText} />
      <h2 className="mt-3 font-sans text-body font-semibold text-on-surface">
        Nenhum documento configurado
      </h2>
      <p className="mt-1 max-w-[34ch] font-sans text-body-sm text-on-surface-variant">
        Adicione documentos em legalDocuments.ts para exibir a central de aceite.
      </p>
    </div>
  );
}
