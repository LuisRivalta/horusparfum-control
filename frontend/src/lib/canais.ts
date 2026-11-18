import Decimal from 'decimal.js'

export type StatusPedidoCanal =
  'aguardando_pagamento' | 'a_confirmar' | 'confirmado' | 'cancelado' | 'cancelado_pos_confirmacao'

export const ROTULO_STATUS: Record<StatusPedidoCanal, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  a_confirmar: 'A confirmar',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  cancelado_pos_confirmacao: 'Cancelado após confirmação',
}

export interface ItemPedidoCanal {
  variante_id: string; titulo: string; quantidade: number; preco_unitario: number
  produto_id: string | null; tipo: 'frasco' | 'decant' | null; ml: number | null
}

/** Espelho da tabela pedidos_canal. */
export interface PedidoCanal {
  id: string; canal: string; externo_id: string; numero: string | null; status: StatusPedidoCanal
  cliente: string | null; criado_em: string | null; total: number | null; frete: number | null
  itens: ItemPedidoCanal[]; venda_id: string | null; alerta: string | null
}

export interface LinhaPedido { tipo: 'produto' | 'decant'; produto_id: string; ml: string; quantidade: string; preco: string }

/** Menor valor terminado em ,90 que cobre custo + margem + taxa do canal; mínimo 8,90. */
export function precoShopify(custo: number, margem: number, taxaPct: number): number {
  if (taxaPct >= 100) throw new Error('Taxa do canal inválida')
  const bruto = new Decimal(custo).times(new Decimal(1).plus(margem)).div(new Decimal(1).minus(new Decimal(taxaPct).div(100)))
  const grade = bruto.minus('0.9').ceil().plus('0.9')
  return Decimal.max(grade, '8.9').toDecimalPlaces(2).toNumber()
}

/** Itens do pedido → linhas do formulário de venda (strings, como no formulário). */
export function linhasDoPedido(p: PedidoCanal): LinhaPedido[] {
  return p.itens.map((i) => ({
    tipo: i.tipo === 'decant' ? 'decant' : 'produto',
    produto_id: i.produto_id ?? '',
    ml: i.tipo === 'decant' && i.ml != null ? String(i.ml) : '',
    quantidade: String(i.quantidade),
    preco: String(i.preco_unitario),
  }))
}
