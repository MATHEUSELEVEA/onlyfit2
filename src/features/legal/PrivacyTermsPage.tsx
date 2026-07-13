import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
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
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
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

  const pendingCount = documents.filter((item) => item.status !== 'accepted').length;
  const acceptedCount = documents.length - pendingCount;
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

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => ({ ...current, [key]: !current[key] }));
  }

  async function acceptDocument(item: LegalDocumentState) {
    if (
      item.status === 'accepted' ||
      checkedByKey[item.document.key] !== true ||
      acceptMutation.isPending
    ) {
      return;
    }
    await acceptMutation.mutateAsync(item.document);
    setCheckedByKey((current) => ({ ...current, [item.document.key]: false }));
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

        <main className="px-4 py-5">
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

            <div className="divide-y divide-outline-variant/25 border-t border-outline-variant/25">
              {isLoading ? (
                <LoadingBlock />
              ) : documents.length === 0 ? (
                <EmptyBlock />
              ) : (
                documents.map((item) => (
                  <DocumentAccordionItem
                    key={item.document.key}
                    item={item}
                    expanded={expandedKeys[item.document.key] === true}
                    checked={checkedByKey[item.document.key] === true}
                    accepting={
                      acceptMutation.isPending &&
                      acceptMutation.variables?.key === item.document.key
                    }
                    acceptError={
                      acceptMutation.isError &&
                      acceptMutation.variables?.key === item.document.key
                    }
                    acceptedAtLabel={
                      item.currentAcceptance
                        ? dateFormatter.format(new Date(item.currentAcceptance.acceptedAt))
                        : null
                    }
                    onToggle={() => toggleExpanded(item.document.key)}
                    onCheckedChange={(next) =>
                      setCheckedByKey((current) => ({ ...current, [item.document.key]: next }))
                    }
                    onAccept={() => acceptDocument(item)}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function DocumentAccordionItem({
  item,
  expanded,
  checked,
  accepting,
  acceptError,
  acceptedAtLabel,
  onToggle,
  onCheckedChange,
  onAccept,
}: {
  item: LegalDocumentState;
  expanded: boolean;
  checked: boolean;
  accepting: boolean;
  acceptError: boolean;
  acceptedAtLabel: string | null;
  onToggle: () => void;
  onCheckedChange: (next: boolean) => void;
  onAccept: () => void;
}) {
  const { document, status } = item;
  const panelId = `doc-panel-${document.key}`;
  const isAccepted = status === 'accepted';

  return (
    <div className={clsx('transition-colors', expanded && 'bg-surface-container-low')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors active:bg-surface-container-low"
      >
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-sans text-body font-semibold text-on-surface">
              {document.title}
            </span>
            <StatusPill status={status} />
          </span>
          <span className="mt-1 block font-sans text-body-sm text-on-surface-variant">
            Versão {document.version}
          </span>
        </span>
        <ChevronDown
          size={20}
          aria-hidden
          className={clsx(
            'mt-0.5 shrink-0 text-on-surface-variant transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <div id={panelId} className="px-4 pb-4">
        <p className="max-w-[68ch] font-sans text-body text-on-surface-variant">
          {document.description}
        </p>

        {expanded && (
          <div className="mt-3 animate-doc-reveal">
            <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
              <iframe
                title={`PDF - ${document.title}`}
                src={document.pdfPath}
                className="h-[58vh] min-h-[420px] w-full bg-surface-container-lowest"
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low sm:flex-none"
          >
            {expanded ? (
              <>
                <ChevronDown size={16} className="rotate-180" aria-hidden />
                Recolher
              </>
            ) : (
              <>
                <ExternalLink size={16} aria-hidden />
                Ler na tela
              </>
            )}
          </button>
          <a
            href={document.pdfPath}
            download
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low sm:flex-none"
          >
            <Download size={16} aria-hidden />
            Baixar
          </a>
        </div>

        <div className="mt-4">
          {isAccepted && acceptedAtLabel ? (
            <AcceptedNotice acceptedAt={acceptedAtLabel} />
          ) : (
            <div className="space-y-3">
              {status === 'new_version' && item.latestAcceptance && (
                <p className="rounded-xl bg-surface-container-low px-3 py-3 font-sans text-body-sm text-on-surface-variant">
                  Você já havia registrado uma versão anterior. Esta versão exige nova confirmação.
                </p>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-outline-variant/40 px-3 py-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onCheckedChange(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
                />
                <span className="font-sans text-body text-on-surface">{document.checkboxLabel}</span>
              </label>

              {acceptError && (
                <p role="alert" className="font-sans text-body-sm text-error">
                  Não foi possível registrar agora. Tente novamente.
                </p>
              )}

              <button
                type="button"
                onClick={onAccept}
                disabled={!checked || accepting}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {accepting ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden />
                ) : (
                  <Check size={17} aria-hidden />
                )}
                {document.actionLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: LegalStatus }) {
  if (status === 'accepted') {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <ShieldCheck size={19} aria-hidden />
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
