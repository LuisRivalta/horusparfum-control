import Decimal from 'decimal.js'

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
  const total = new Decimal(estoqueAtual).mul(custoMedio).add(new Decimal(qtdRecebida).mul(precoUnitario))
  // Decimal.js para aritmética exata: casa com o ROUND(numeric,2) do
  // Postgres em casos .xx5 (ex: média exata 10.005), onde o float fica abaixo
  return total.div(new Decimal(estoqueAtual).add(qtdRecebida)).toDecimalPlaces(2).toNumber()
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
    if (!Number.isInteger(item.qtdRecebida)) {
      erros.push('Quantidade recebida deve ser um número inteiro')
      continue
    }
    if (item.qtdRecebida !== item.qtdPedida && !item.divergenciaTipo) {
      erros.push('Item com quantidade divergente exige tipo de divergência')
    }
  }
  return erros
}
