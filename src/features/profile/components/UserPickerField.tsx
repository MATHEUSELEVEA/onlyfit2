import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import { BadgeCheck, Loader2, Search, UserRound, X } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import {
  USER_SEARCH_MIN_LENGTH,
  normalizeUserSearchTerm,
  useUserSearch,
  type UserSuggestion,
} from '../useUserSearch';

interface UserPickerFieldProps {
  label: string;
  /** Texto de apoio quando não há erro nem busca em andamento. */
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  selected: UserSuggestion | null;
  onSelect: (user: UserSuggestion | null) => void;
}

function Avatar({ user, size }: { user: UserSuggestion; size: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12';
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className={clsx(box, 'shrink-0 rounded-full object-cover')} />;
  }
  return (
    <span
      aria-hidden
      className={clsx(box, 'flex shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant')}
    >
      <UserRound size={size === 'sm' ? 18 : 22} />
    </span>
  );
}

// Destaca o trecho que casou com a busca por peso, não por cor: o olho acha a
// pessoa na lista sem que o item compita com o CTA do formulário.
function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-on-surface">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" aria-hidden>
      <span className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high motion-safe:animate-pulse" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3 w-2/5 rounded-full bg-surface-container-high motion-safe:animate-pulse" />
        <span className="block h-2.5 w-1/4 rounded-full bg-surface-container-high motion-safe:animate-pulse" />
      </span>
    </div>
  );
}

/**
 * Campo de escolha de pessoa: busca por nome ou @usuário e mostra sugestões com
 * foto, nome e @ — encontrar alguém não exige saber o @usuário de cor.
 *
 * A lista é inline (empurra o conteúdo) em vez de flutuar: o campo vive dentro
 * do BottomSheet, que tem overflow próprio e recortaria um dropdown absoluto.
 */
export function UserPickerField({
  label,
  hint,
  error,
  disabled,
  query,
  onQueryChange,
  selected,
  onSelect,
}: UserPickerFieldProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const listId = `${fieldId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [listOpen, setListOpen] = useState(false);
  // O item em foco pertence ao termo que o produziu: quando a busca muda, o
  // foco antigo deixa de valer sozinho — nada a limpar depois.
  const [active, setActive] = useState({ term: '', index: -1 });

  // Espera a digitação parar antes de ir ao banco — uma ida por letra
  // desperdiça request e faz a lista tremer.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const term = normalizeUserSearchTerm(debouncedQuery).toLowerCase();
  const hasTerm = term.length >= USER_SEARCH_MIN_LENGTH;
  const { data: suggestions = [], isFetching, isError } = useUserSearch(debouncedQuery);

  const showList = listOpen && !selected && hasTerm;
  // A lista só some quando a busca do termo ATUAL responde: enquanto o debounce
  // não venceu, os resultados na tela ainda são da letra anterior.
  const isSearching = isFetching || normalizeUserSearchTerm(query).toLowerCase() !== term;
  const activeIndex = active.term === term ? active.index : -1;

  function setActiveIndex(index: number) {
    setActive({ term, index });
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function pick(user: UserSuggestion) {
    onSelect(user);
    onQueryChange(user.username);
    setListOpen(false);
    setActiveIndex(-1);
  }

  function clear() {
    onSelect(null);
    onQueryChange('');
    setListOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasTerm) return;
      setListOpen(true);
      if (!suggestions.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex + step;
      setActiveIndex(next < 0 ? suggestions.length - 1 : next >= suggestions.length ? 0 : next);
      return;
    }
    if (event.key === 'Enter' && showList && activeIndex >= 0 && suggestions[activeIndex]) {
      // Enter escolhe a sugestão em foco; sem isto o form enviaria o convite.
      event.preventDefault();
      pick(suggestions[activeIndex]);
      return;
    }
    if (event.key === 'Escape' && showList) {
      // Fecha só a lista — o BottomSheet ouve Escape no window para se fechar.
      event.stopPropagation();
      setListOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="space-y-1.5">
      {/* Com alguém escolhido não há input para o label apontar: vira só texto. */}
      {selected ? (
        <span className="block font-sans text-body-sm font-medium text-on-surface-variant">{label}</span>
      ) : (
        <label htmlFor={fieldId} className="block font-sans text-body-sm font-medium text-on-surface-variant">
          {label}
        </label>
      )}

      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-surface-container px-3 py-2.5">
          <Avatar user={selected} size="md" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-sans text-body font-semibold text-on-surface">{selected.name}</span>
              {selected.isProfessional && (
                <BadgeCheck size={15} className="shrink-0 text-primary" aria-label={t('profile.professional')} />
              )}
            </span>
            <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
              @{selected.username}
            </span>
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="min-h-11 shrink-0 rounded-full px-3 font-sans text-label text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {t('userSearch.change')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            ref={inputRef}
            id={fieldId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            value={query}
            placeholder={t('userSearch.placeholder')}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            onKeyDown={handleKeyDown}
            className={clsx(
              'min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low pl-10 pr-10 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60',
              error && 'border-error focus:border-error focus:ring-error',
            )}
          />
          {isSearching && hasTerm ? (
            <Loader2
              size={16}
              aria-hidden
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant motion-safe:animate-spin"
            />
          ) : query ? (
            <button
              type="button"
              onClick={clear}
              aria-label={t('userSearch.clear')}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      )}

      {showList && (
        <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-low">
          {isError ? (
            <p role="alert" className="px-3.5 py-3 font-sans text-body-sm text-error">
              {t('userSearch.error')}
            </p>
          ) : suggestions.length === 0 && isSearching ? (
            <>
              <SuggestionSkeleton />
              <SuggestionSkeleton />
              <SuggestionSkeleton />
            </>
          ) : suggestions.length === 0 ? (
            <div className="px-3.5 py-4">
              <p className="font-sans text-body text-on-surface">{t('userSearch.empty')}</p>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{t('userSearch.emptyHint')}</p>
            </div>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={t('userSearch.suggestions')}
              className="max-h-64 overflow-y-auto"
            >
              {suggestions.map((user, index) => (
                <li
                  key={user.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="border-b border-outline-variant/20 last:border-b-0"
                >
                  <button
                    type="button"
                    // O clique precisa vencer o blur do input, que fecharia a lista antes.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(user)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={clsx(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none',
                      index === activeIndex ? 'bg-surface-container-high' : 'hover:bg-surface-container',
                    )}
                  >
                    <Avatar user={user} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-sans text-body text-on-surface">
                          <Highlight text={user.name} term={term} />
                        </span>
                        {user.isProfessional && (
                          <BadgeCheck size={14} className="shrink-0 text-primary" aria-label={t('profile.professional')} />
                        )}
                      </span>
                      <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
                        @<Highlight text={user.username} term={term} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="font-sans text-body-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="font-sans text-body-sm text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}
