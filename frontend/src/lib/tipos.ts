export interface TipoProduto { id: string; nome: string; vende_decant: boolean }

// Produto sem tipo (ou tipo desconhecido) conta como perfume: não esconde perfume antigo antes da migration.
export function vendeDecant(
  p: { tipo_id?: string | null },
  tipos: { id: string; vende_decant: boolean }[],
): boolean {
  if (!p.tipo_id) return true
  return tipos.find((t) => t.id === p.tipo_id)?.vende_decant ?? true
}
