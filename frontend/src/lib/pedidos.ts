export type PedidoStatus = 'aguardando' | 'recebido' | 'cancelado'
export type DivergenciaTipo = 'faltou' | 'veio_a_mais' | 'avariado' | 'produto_errado'

export const DIVERGENCIA_TIPOS: { value: DivergenciaTipo; label: string }[] = [
  { value: 'faltou', label: 'Faltou' },
  { value: 'veio_a_mais', label: 'Veio a mais' },
  { value: 'avariado', label: 'Avariado' },
  { value: 'produto_errado', label: 'Produto errado' },
]

export interface ConferenciaItem {
  itemId: string
  qtdPedida: number
  qtdRecebida: number
  divergenciaTipo: DivergenciaTipo | null
  divergenciaObs: string
}

/** Custo médio ponderado. Espelha a regra da RPC confirmar_recebimento. */
export function calcularCustoMedio(
  estoqueAtual: number,
  custoMedio: number | null,
  qtdRecebida: number,
  precoUnitario: number
): number {
  if (custoMedio === null || estoqueAtual <= 0) return precoUnitario
  const total = estoqueAtual * custoMedio + qtdRecebida * precoUnitario
  return Math.round((total / (estoqueAtual + qtdRecebida)) * 100) / 100
}

export function calcularTotalPedido(itens: { qtd: number; preco: number }[]): number {
  return itens.reduce((acc, i) => acc + i.qtd * i.preco, 0)
}

/** Retorna lista de mensagens de erro; vazia = conferência válida. */
export function validarConferencia(itens: ConferenciaItem[]): string[] {
  const erros: string[] = []
  for (const item of itens) {
    if (item.qtdRecebida < 0) {
      erros.push('Quantidade recebida não pode ser negativa')
      continue
    }
    if (item.qtdRecebida !== item.qtdPedida && !item.divergenciaTipo) {
      erros.push('Item com quantidade divergente exige tipo de divergência')
    }
  }
  return erros
}
