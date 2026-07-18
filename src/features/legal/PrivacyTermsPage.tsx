import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
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

  // Pendências primeiro: o que exige ação fica no topo, já assinados descem.
  const orderedDocuments = useMemo(() => {
    const pending = documents.filter((item) => item.status !== 'accepted');
    const accepted = documents.filter((item) => item.status === 'accepted');
    return [...pending, ...accepted];
  }, [documents]);

  const total = documents.length;
  const pendingCount = documents.filter((item) => item.status !== 'accepted').length;
  const acceptedCount = total - pendingCount;
  const isLoading = isLoadingDocuments || isLoadingAcceptances;
  const isError = isDocumentsError || isAcceptancesError;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [language],
  );

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
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/25">
        <header className="sticky top-0 z-20 border-b border-outline-variant/25 bg-background/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <Link
              to="/perfil"
              aria-label="Voltar para o perfil"
              className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">
                Privacidade e Termos
              </h1>
              <p className="font-sans text-body-sm text-on-surface-variant">
                Documentos vigentes e aceites obrigatórios.
              </p>
            </div>
          </div>

          {!isLoading && !isError && total > 0 && (
            <ProgressSummary accepted={acceptedCount} total={total} pending={pendingCount} />
          )}
        </header>

        <main className="px-4 py-4">
          {isError ? (
            <ErrorBlock
              onRetry={() => {
                void refetchDocuments();
                void refetchAcceptances();
              }}
            />
          ) : isLoading ? (
            <SkeletonList />
          ) : documents.length === 0 ? (
            <EmptyBlock />
          ) : (
            <ul className="space-y-3">
              {orderedDocuments.map((item) => (
                <li key={item.document.key}>
                  {item.status === 'accepted' ? (
                    <AcceptedCard
                      item={item}
                      acceptedAtLabel={
                        item.currentAcceptance
                          ? dateFormatter.format(new Date(item.currentAcceptance.acceptedAt))
                          : null
                      }
                    />
                  ) : (
                    <PendingCard
                      item={item}
                      checked={checkedByKey[item.document.key] === true}
                      accepting={
                        acceptMutation.isPending &&
                        acceptMutation.variables?.key === item.document.key
                      }
                      acceptError={
                        acceptMutation.isError &&
                        acceptMutation.variables?.key === item.document.key
                      }
                      onCheckedChange={(next) =>
                        setCheckedByKey((current) => ({ ...current, [item.document.key]: next }))
                      }
                      onAccept={() => acceptDocument(item)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}

function ProgressSummary({
  accepted,
  total,
  pending,
}: {
  accepted: number;
  total: number;
  pending: number;
}) {
  const pct = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const allDone = pending === 0;

  return (
    <div className="mt-4 rounded-2xl bg-surface-container p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-label text-on-surface-variant">Aceites registrados</span>
        {allDone ? (
          <span className="inline-flex items-center gap-1 font-sans text-label text-primary">
            <ShieldCheck size={15} aria-hidden />
            Tudo em dia
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-2.5 py-0.5 font-sans text-counter text-on-secondary-container">
            <Clock3 size={13} aria-hidden />
            {pending} pendente{pending > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
          role="progressbar"
          aria-valuenow={accepted}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${accepted} de ${total} documentos assinados`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 font-sans text-label tabular-nums text-on-surface">
          {accepted}/{total}
        </span>
      </div>
    </div>
  );
}

function PendingCard({
  item,
  checked,
  accepting,
  acceptError,
  onCheckedChange,
  onAccept,
}: {
  item: LegalDocumentState;
  checked: boolean;
  accepting: boolean;
  acceptError: boolean;
  onCheckedChange: (next: boolean) => void;
  onAccept: () => void;
}) {
  const { document, status, latestAcceptance } = item;

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-container-low ring-1 ring-secondary/25">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <Clock3 size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-sans text-body font-semibold text-on-surface">{document.title}</h2>
              <span className="inline-flex items-center rounded-full bg-secondary-container px-2 py-0.5 font-sans text-counter text-on-secondary-container">
                {status === 'new_version' ? 'Nova versão' : 'Pendente'}
              </span>
            </div>
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
              Versão {document.version}
            </p>
          </div>
        </div>

        <p className="mt-3 max-w-[62ch] font-sans text-body-sm text-on-surface-variant">
          {document.description}
        </p>

        {status === 'new_version' && latestAcceptance && (
          <p className="mt-3 rounded-xl bg-surface-container-high px-3 py-2 font-sans text-body-sm text-on-surface-variant">
            Você aceitou uma versão anterior — esta atualização exige nova confirmação.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <DocLink icon={ExternalLink} href={document.pdfPath} download={false}>
            Abrir PDF
          </DocLink>
          <DocLink icon={Download} href={document.pdfPath} download>
            Baixar
          </DocLink>
        </div>
      </div>

      <div className="border-t border-outline-variant/20 bg-surface-container px-4 py-3.5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
          />
          <span className="font-sans text-body-sm text-on-surface">{document.checkboxLabel}</span>
        </label>

        {acceptError && (
          <p role="alert" className="mt-2.5 flex items-center gap-1.5 font-sans text-body-sm text-error">
            <TriangleAlert size={15} aria-hidden />
            Não foi possível registrar agora. Tente novamente.
          </p>
        )}

        <button
          type="button"
          onClick={onAccept}
          disabled={!checked || accepting}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45 motion-reduce:active:scale-100"
        >
          {accepting ? (
            <Loader2 size={17} className="animate-spin" aria-hidden />
          ) : (
            <Check size={17} aria-hidden />
          )}
          {document.actionLabel}
        </button>
      </div>
    </div>
  );
}

function AcceptedCard({
  item,
  acceptedAtLabel,
}: {
  item: LegalDocumentState;
  acceptedAtLabel: string | null;
}) {
  const { document } = item;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <ShieldCheck size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-sans text-body font-semibold text-on-surface">
          {document.title}
        </h2>
        <p className="truncate font-sans text-body-sm text-on-surface-variant">
          {acceptedAtLabel ? `Assinado em ${acceptedAtLabel}` : 'Assinado'} · v{document.version}
        </p>
      </div>
      <a
        href={document.pdfPath}
        target="_blank"
        rel="noreferrer"
        aria-label={`Abrir PDF de ${document.title}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface active:bg-surface-container-high"
      >
        <ExternalLink size={18} aria-hidden />
      </a>
    </div>
  );
}

function DocLink({
  icon: Icon,
  href,
  download,
  children,
}: {
  icon: typeof ExternalLink;
  href: string;
  download: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      download={download || undefined}
      target={download ? undefined : '_blank'}
      rel={download ? undefined : 'noreferrer'}
      className="inline-flex min-h-9 items-center gap-1.5 font-sans text-label text-primary transition-colors active:opacity-70"
    >
      <Icon size={16} aria-hidden />
      {children}
    </a>
  );
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <TriangleAlert size={20} aria-hidden />
      </span>
      <h2 className="mt-3 font-sans text-body font-semibold text-on-surface">
        Não foi possível carregar
      </h2>
      <p className="mt-1 max-w-[34ch] font-sans text-body-sm text-on-surface-variant">
        Verifique sua conexão e tente novamente.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
      >
        Tentar novamente
      </button>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li
          key={index}
          className="animate-pulse rounded-2xl bg-surface-container-low p-4 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 shrink-0 rounded-full bg-surface-container-highest" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded-full bg-surface-container-highest" />
              <div className="h-3 w-1/4 rounded-full bg-surface-container-highest" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded-full bg-surface-container-highest" />
            <div className="h-3 w-3/4 rounded-full bg-surface-container-highest" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyBlock() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-container-low px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FileText size={20} aria-hidden />
      </span>
      <h2 className="mt-3 font-sans text-body font-semibold text-on-surface">
        Nenhum documento vigente
      </h2>
      <p className="mt-1 max-w-[34ch] font-sans text-body-sm text-on-surface-variant">
        Quando houver termos a assinar, eles aparecerão aqui.
      </p>
    </div>
  );
}
