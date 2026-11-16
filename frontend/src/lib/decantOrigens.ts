import Decimal from 'decimal.js'
import { custoDecantUnitario } from '@/lib/vendas'

export type Origem =
  | { tipo: 'frasco'; frascoId: string; produtoId: string; ml: number }
  | { tipo: 'abrir'; produtoId: string; ml: number }
export interface FrascoAtivo { id: string; produtoId: string; mlRestante: number; mlTotal: number }

// Caminho padrão: frasco aberto primeiro, depois abre um lacrado. Substituição por outro perfume é montada pela tela.
export function planejarOrigens(
  mlNecessario: number, frasco: FrascoAtivo | null, produtoId: string, lacrados: number, volumeMl: number,
): Origem[] | null {
  const origens: Origem[] = []
  const doAberto = frasco ? Decimal.min(mlNecessario, Math.max(frasco.mlRestante, 0)) : new Decimal(0)
  if (frasco && doAberto.gt(0)) origens.push({ tipo: 'frasco', frascoId: frasco.id, produtoId: frasco.produtoId, ml: doAberto.toNumber() })
  const falta = new Decimal(mlNecessario).sub(doAberto)
  if (falta.lte(0)) return origens
  if (lacrados < 1 || falta.gt(volumeMl)) return null
  origens.push({ tipo: 'abrir', produtoId, ml: falta.toNumber() })
  return origens
}

export function totalOrigens(origens: Origem[]): number {
  return origens.reduce((s, o) => s.add(o.ml), new Decimal(0)).toNumber()
}

export function custoPrevistoOrigens(
  origens: Origem[], custoMedioPorProduto: Record<string, number>, volumePorProduto: Record<string, number>,
): number {
  return origens
    .reduce((s, o) => s.add(custoDecantUnitario(o.ml, custoMedioPorProduto[o.produtoId] ?? 0, volumePorProduto[o.produtoId] ?? 0)), new Decimal(0))
    .toDecimalPlaces(2).toNumber()
}

export function origemParaJson(o: Origem): { frasco_id?: string; abrir_produto_id?: string; ml: number } {
  return o.tipo === 'frasco' ? { frasco_id: o.frascoId, ml: o.ml } : { abrir_produto_id: o.produtoId, ml: o.ml }
}
