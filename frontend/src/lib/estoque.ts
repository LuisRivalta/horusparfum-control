export type SituacaoEstoque = 'ok' | 'baixo' | 'critico'
export type OrdemEstoque = 'qty_desc' | 'qty_asc' | 'az' | 'za'

export function situacaoEstoque(estoqueAtual: number, estoqueMinimo: number): SituacaoEstoque {
  if (estoqueAtual <= Math.ceil(estoqueMinimo * 0.5)) return 'critico'
  if (estoqueAtual <= estoqueMinimo) return 'baixo'
  return 'ok'
}

export function ordenarProdutos<T extends { nome: string; estoque_atual: number }>(
  produtos: T[],
  ordem: OrdemEstoque
): T[] {
  return [...produtos].sort((a, b) => {
    if (ordem === 'qty_desc') return b.estoque_atual - a.estoque_atual
    if (ordem === 'qty_asc') return a.estoque_atual - b.estoque_atual
    if (ordem === 'az') return a.nome.localeCompare(b.nome)
    return b.nome.localeCompare(a.nome)
  })
}
