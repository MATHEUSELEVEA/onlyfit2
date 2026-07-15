// Sanitiza o termo para uso em .or(...ilike...) do PostgREST: vírgula separa
// filtros e parênteses agrupam, então removê-los evita query malformada.
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%]/g, ' ').trim();
}
