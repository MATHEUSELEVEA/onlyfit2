import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Loader2, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { supabase } from '@/lib/supabase';

interface BusinessWorkspaceRow {
  id: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  business_type: string | null;
}

export function BusinessWorkspacePage() {
  const { businessId } = useParams();
  const { t } = useTranslation();
  const { data: business, isLoading, isError } = useQuery({
    queryKey: ['mobile-business-workspace', businessId],
    enabled: Boolean(businessId),
    queryFn: async (): Promise<BusinessWorkspaceRow | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id,name,logo_url,verified,business_type')
        .eq('id', businessId!)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessWorkspaceRow | null;
    },
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto min-h-full w-full max-w-[640px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/20 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/negocios"
              aria-label={t('profile.business.workspace.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <h1 className="truncate font-sans text-title-lg text-on-surface">
              {business?.name ?? t('profile.business.workspace.title')}
            </h1>
          </div>
        </header>

        <main className="px-4 pb-8 pt-6">
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-primary" aria-label={t('profile.business.loading')} />
            </div>
          ) : isError || !business ? (
            <div className="rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
              <p className="font-sans text-body font-semibold">{t('profile.business.workspace.loadError')}</p>
              <Link to="/negocios" className="mt-3 inline-flex min-h-11 items-center font-sans text-label underline">
                {t('profile.business.workspace.backToBusinesses')}
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {business.logo_url ? (
                  <img src={business.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Building2 size={27} aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-sans text-title text-on-surface">{business.name}</h2>
                    {business.verified && <ShieldCheck size={18} className="shrink-0 text-primary" aria-label={t('profile.business.verified')} />}
                  </div>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                    {business.business_type === 'company'
                      ? t('profile.business.create.company')
                      : t('profile.business.create.independent')}
                  </p>
                </div>
              </div>

              <section className="mt-8 rounded-2xl bg-surface-container-low p-5">
                <h2 className="font-sans text-title text-on-surface">{t('profile.business.workspace.comingTitle')}</h2>
                <p className="mt-2 max-w-[48ch] font-sans text-body text-on-surface-variant">
                  {t('profile.business.workspace.comingDescription')}
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
