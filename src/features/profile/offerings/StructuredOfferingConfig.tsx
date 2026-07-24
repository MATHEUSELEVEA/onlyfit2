import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useUpdateOfferingSettings } from '../useBusinessOfferings';
import type { OfferingConfigProps } from './OfferingConfigProps';

type Settings = Record<string, unknown>;

function textSetting(settings: Settings, key: string, fallback = ''): string {
  const value = settings[key];
  return typeof value === 'string' ? value : fallback;
}

function boolSetting(settings: Settings, key: string, fallback = false): boolean {
  const value = settings[key];
  return typeof value === 'boolean' ? value : fallback;
}

function numberSetting(settings: Settings, key: string, fallback: number): string {
  const value = settings[key];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return String(fallback);
}

function listSetting(settings: Settings, key: string, fallback: string[]): string[] {
  const value = settings[key];
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length ? items : fallback;
}

function toPositiveInt(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-sans text-body-sm font-medium text-on-surface-variant">{label}</p>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={value}
              maxLength={160}
              placeholder={placeholder}
              onChange={(event) => onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              aria-label="Remover"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant"
            >
              <Trash2 size={17} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-surface-container-high px-3 font-sans text-label text-on-surface"
      >
        <Plus size={16} aria-hidden />
        Adicionar
      </button>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block font-sans text-body-sm font-medium text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SaveButton({ pending, disabled }: { pending: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
    >
      {pending && <Loader2 size={18} className="animate-spin" aria-hidden />}
      {pending ? 'Salvando' : 'Salvar configuração'}
    </button>
  );
}

function FormShell({
  title,
  children,
  feedback,
  error,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  feedback: string | null;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-surface-container p-5">
      <p className="font-sans text-body font-semibold text-on-surface">{title}</p>
      {children}
      {error && <p role="alert" className="font-sans text-body-sm text-error">{error}</p>}
      {feedback && <p role="status" className="font-sans text-body-sm text-primary">{feedback}</p>}
    </form>
  );
}

export function PremiumContentSettingsConfig({ offering }: OfferingConfigProps) {
  const settings = offering.settings ?? {};
  const saveSettings = useUpdateOfferingSettings(offering.organization_id, offering.id);
  const [headline, setHeadline] = useState(textSetting(settings, 'headline', offering.name));
  const [subscriberLabel, setSubscriberLabel] = useState(textSetting(settings, 'subscriber_label', 'Assinantes'));
  const [deliveryNotes, setDeliveryNotes] = useState(textSetting(settings, 'delivery_notes', 'Acesso liberado automaticamente após confirmação do pagamento.'));
  const [includesCommunity, setIncludesCommunity] = useState(boolSetting(settings, 'includes_community', false));
  const [benefits, setBenefits] = useState(listSetting(settings, 'benefits', ['Conteúdo exclusivo do perfil']));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => headline.trim().length >= 3 && benefits.some((item) => item.trim().length >= 3), [benefits, headline]);

  return (
    <FormShell
      title="Premium do perfil"
      feedback={feedback}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setFeedback(null);
        setError(null);
        if (!ready) {
          setError('Informe uma chamada e pelo menos um benefício.');
          return;
        }
        saveSettings.mutate({
          headline: headline.trim(),
          subscriber_label: subscriberLabel.trim() || 'Assinantes',
          delivery_notes: deliveryNotes.trim(),
          includes_community: includesCommunity,
          benefits: benefits.map((item) => item.trim()).filter(Boolean),
        }, {
          onSuccess: () => setFeedback('Configuração salva. A assinatura já pode usar estes dados no checkout.'),
          onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.'),
        });
      }}
    >
      <TextField label="Chamada da assinatura" value={headline} maxLength={140} onChange={(event) => setHeadline(event.target.value)} />
      <TextField label="Nome do grupo de acesso" value={subscriberLabel} maxLength={80} onChange={(event) => setSubscriberLabel(event.target.value)} />
      <ListEditor label="Benefícios" values={benefits} onChange={setBenefits} placeholder="Ex.: vídeos exclusivos semanais" />
      <TextAreaField label="Entrega e acesso" value={deliveryNotes} maxLength={600} rows={3} onChange={(event) => setDeliveryNotes(event.target.value)} />
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-container-high px-3 font-sans text-body text-on-surface">
        <input type="checkbox" checked={includesCommunity} onChange={(event) => setIncludesCommunity(event.target.checked)} />
        Inclui comunidade privada
      </label>
      <SaveButton pending={saveSettings.isPending} disabled={!ready} />
    </FormShell>
  );
}

export function HealthConsultancySettingsConfig({ offering }: OfferingConfigProps) {
  const settings = offering.settings ?? {};
  const saveSettings = useUpdateOfferingSettings(offering.organization_id, offering.id);
  const [format, setFormat] = useState(textSetting(settings, 'format', 'online'));
  const [duration, setDuration] = useState(numberSetting(settings, 'duration_minutes', 60));
  const [sessions, setSessions] = useState(numberSetting(settings, 'sessions_per_cycle', 1));
  const [intakeRequired, setIntakeRequired] = useState(boolSetting(settings, 'intake_form_required', true));
  const [schedulingNotes, setSchedulingNotes] = useState(textSetting(settings, 'scheduling_notes', 'Agendamento combinado após confirmação do pagamento.'));
  const [deliverables, setDeliverables] = useState(listSetting(settings, 'deliverables', ['Avaliação inicial', 'Plano de ação personalizado']));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = schedulingNotes.trim().length >= 3 || deliverables.some((item) => item.trim().length >= 3);

  return (
    <FormShell
      title="Consultoria"
      feedback={feedback}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setFeedback(null);
        setError(null);
        if (!ready) {
          setError('Informe como a consultoria será entregue.');
          return;
        }
        saveSettings.mutate({
          format,
          duration_minutes: toPositiveInt(duration, 60, 15, 240),
          sessions_per_cycle: toPositiveInt(sessions, 1, 1, 60),
          intake_form_required: intakeRequired,
          scheduling_notes: schedulingNotes.trim(),
          deliverables: deliverables.map((item) => item.trim()).filter(Boolean),
        }, {
          onSuccess: () => setFeedback('Configuração salva.'),
          onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.'),
        });
      }}
    >
      <SelectRow
        label="Formato"
        value={format}
        onChange={setFormat}
        options={[
          { value: 'online', label: 'Online' },
          { value: 'in_person', label: 'Presencial' },
          { value: 'hybrid', label: 'Híbrida' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Minutos" value={duration} inputMode="numeric" onChange={(event) => setDuration(event.target.value.replace(/\D/g, ''))} />
        <TextField label="Sessões/ciclo" value={sessions} inputMode="numeric" onChange={(event) => setSessions(event.target.value.replace(/\D/g, ''))} />
      </div>
      <ListEditor label="Entregáveis" values={deliverables} onChange={setDeliverables} placeholder="Ex.: ajuste semanal do plano" />
      <TextAreaField label="Agendamento" value={schedulingNotes} maxLength={800} rows={3} onChange={(event) => setSchedulingNotes(event.target.value)} />
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-container-high px-3 font-sans text-body text-on-surface">
        <input type="checkbox" checked={intakeRequired} onChange={(event) => setIntakeRequired(event.target.checked)} />
        Exigir anamnese antes do atendimento
      </label>
      <SaveButton pending={saveSettings.isPending} disabled={!ready} />
    </FormShell>
  );
}

export function PhysicalProductsSettingsConfig({ offering }: OfferingConfigProps) {
  const settings = offering.settings ?? {};
  const saveSettings = useUpdateOfferingSettings(offering.organization_id, offering.id);
  const [productCategory, setProductCategory] = useState(textSetting(settings, 'product_category', 'Produto'));
  const [sku, setSku] = useState(textSetting(settings, 'sku', ''));
  const [fulfillmentType, setFulfillmentType] = useState(textSetting(settings, 'fulfillment_type', 'shipping'));
  const [stockMode, setStockMode] = useState(textSetting(settings, 'stock_mode', 'limited'));
  const [shippingOrigin, setShippingOrigin] = useState(textSetting(settings, 'shipping_origin', ''));
  const [shippingPolicy, setShippingPolicy] = useState(textSetting(settings, 'shipping_policy', 'Entrega combinada pelo vendedor após confirmação do pagamento.'));
  const [allowPickup, setAllowPickup] = useState(boolSetting(settings, 'allow_pickup', false));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = productCategory.trim().length >= 2;

  return (
    <FormShell
      title="Produto do mercado"
      feedback={feedback}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setFeedback(null);
        setError(null);
        if (!ready) {
          setError('Informe a categoria do produto.');
          return;
        }
        saveSettings.mutate({
          product_category: productCategory.trim(),
          sku: sku.trim(),
          fulfillment_type: fulfillmentType,
          stock_mode: stockMode,
          shipping_origin: shippingOrigin.trim(),
          shipping_policy: shippingPolicy.trim(),
          allow_pickup: allowPickup,
        }, {
          onSuccess: () => setFeedback('Configuração salva.'),
          onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.'),
        });
      }}
    >
      <TextField label="Categoria" value={productCategory} maxLength={80} onChange={(event) => setProductCategory(event.target.value)} />
      <TextField label="SKU interno" value={sku} maxLength={80} onChange={(event) => setSku(event.target.value)} />
      <SelectRow
        label="Entrega"
        value={fulfillmentType}
        onChange={setFulfillmentType}
        options={[
          { value: 'shipping', label: 'Envio' },
          { value: 'pickup', label: 'Retirada' },
          { value: 'digital', label: 'Digital' },
          { value: 'hybrid', label: 'Híbrida' },
        ]}
      />
      <SelectRow
        label="Estoque"
        value={stockMode}
        onChange={setStockMode}
        options={[
          { value: 'limited', label: 'Limitado' },
          { value: 'unlimited', label: 'Sem limite' },
          { value: 'preorder', label: 'Pré-venda' },
        ]}
      />
      <TextField label="Origem do envio" value={shippingOrigin} maxLength={120} onChange={(event) => setShippingOrigin(event.target.value)} />
      <TextAreaField label="Política de entrega" value={shippingPolicy} maxLength={800} rows={3} onChange={(event) => setShippingPolicy(event.target.value)} />
      <label className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-container-high px-3 font-sans text-body text-on-surface">
        <input type="checkbox" checked={allowPickup} onChange={(event) => setAllowPickup(event.target.checked)} />
        Permitir retirada combinada
      </label>
      <SaveButton pending={saveSettings.isPending} disabled={!ready} />
    </FormShell>
  );
}
