// Metadados e inferência dos produtos do marketplace (ebook, aulas, treino,
// dieta, mentoria, combo, produto físico). Comunidades e desafios NÃO são
// produtos (são ferramentas de engajamento, não vendáveis). Fonte única usada
// pela vitrine do criador, pelo Mercado, por Meus produtos e pelo Explorar —
// não duplique este mapa em feature nenhuma.
import {
  BookOpen,
  Dumbbell,
  GraduationCap,
  Package,
  Salad,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { FEED_SPORTS } from '@/lib/sports';

export interface ProductTypeMeta {
  /** Chave normalizada, estável para usar como valor de filtro. */
  key: string;
  label: string;
  icon: LucideIcon;
}

// Aceita tanto `type` quanto `market_item_type` do banco (o v1 usa os dois);
// as chaves cobrem português e inglês porque o schema mistura as convenções.
const TYPE_META: Record<string, ProductTypeMeta> = {
  ebook: { key: 'ebook', label: 'Ebook', icon: BookOpen },
  pdf: { key: 'ebook', label: 'Ebook', icon: BookOpen },
  'e-book': { key: 'ebook', label: 'Ebook', icon: BookOpen },
  digital: { key: 'digital', label: 'Digital', icon: BookOpen },
  course: { key: 'course', label: 'Aulas', icon: GraduationCap },
  aula: { key: 'course', label: 'Aulas', icon: GraduationCap },
  aulas: { key: 'course', label: 'Aulas', icon: GraduationCap },
  training: { key: 'training', label: 'Treino', icon: Dumbbell },
  treino: { key: 'training', label: 'Treino', icon: Dumbbell },
  workout: { key: 'training', label: 'Treino', icon: Dumbbell },
  protocol: { key: 'training', label: 'Treino', icon: Dumbbell },
  protocolo: { key: 'training', label: 'Treino', icon: Dumbbell },
  programa: { key: 'training', label: 'Treino', icon: Dumbbell },
  exercise: { key: 'training', label: 'Treino', icon: Dumbbell },
  exercício: { key: 'training', label: 'Treino', icon: Dumbbell },
  diet: { key: 'diet', label: 'Dieta', icon: Salad },
  dieta: { key: 'diet', label: 'Dieta', icon: Salad },
  nutrition: { key: 'diet', label: 'Dieta', icon: Salad },
  nutrição: { key: 'diet', label: 'Dieta', icon: Salad },
  physical: { key: 'physical', label: 'Produto físico', icon: Package },
  mentoria: { key: 'mentoria', label: 'Mentoria', icon: Sparkles },
  combo: { key: 'combo', label: 'Combo', icon: Package },
};

const DEFAULT_META: ProductTypeMeta = { key: 'product', label: 'Produto', icon: ShoppingBag };

// `marketItemType` costuma ser mais específico que `type`, então tem prioridade.
export function productTypeMeta(
  type: string | null | undefined,
  marketItemType?: string | null,
): ProductTypeMeta {
  const typeKey = (type || '').toLowerCase();
  const marketKey = (marketItemType || '').toLowerCase();
  // `digital` é um contêiner genérico; nesses casos o `type` costuma dizer
  // com mais precisão se o item é ebook, curso etc.
  if (marketKey && marketKey !== 'digital') return TYPE_META[marketKey] ?? TYPE_META[typeKey] ?? DEFAULT_META;
  return TYPE_META[typeKey] ?? TYPE_META[marketKey] ?? DEFAULT_META;
}

// Palavras-chave por esporte para inferir os grupos de afinidade de um produto
// a partir do texto (nome/categoria/descrição). É aproximado de propósito: o
// schema de produto não guarda `sports`, e isto só alimenta um filtro opcional.
const SPORT_KEYWORDS: Record<string, string[]> = {
  bodybuilding: ['muscul', 'hipertrofia', 'bodybuild', 'fisiculturismo', 'academia'],
  hyrox: ['hyrox', 'crossfit', 'cross training', 'funcional', 'wod', 'sled', 'burpee broad jump', 'wall ball'],
  lutas: ['luta', 'jiu', 'jitsu', 'boxe', 'muay', 'mma', 'karate', 'karatê', 'judô', 'judo', 'taekwondo'],
  corrida: ['corrida', 'runner', 'running', 'maratona', 'trote', ' 5k', ' 10k', 'meia maratona'],
  triathlon: ['triathlon', 'triatlo', 'ironman', 'ciclismo', 'cycling', 'pedal', 'bike', 'bicicleta', 'spinning', 'natação', 'natacao', 'nado', 'swim', 'piscina'],
  saude: ['saúde', 'saude', 'nutrição', 'nutricao', 'dieta', 'diet', 'alimentação', 'alimentacao', 'nutrition', 'wellness', 'keto', 'emagrec'],
};

export function inferProductSports(text: string): string[] {
  const haystack = text.toLowerCase();
  return FEED_SPORTS.filter(({ key }) =>
    (SPORT_KEYWORDS[key] ?? []).some((word) => haystack.includes(word)),
  ).map(({ key }) => key);
}
