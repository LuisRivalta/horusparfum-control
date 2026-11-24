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

// frascoId '' = origem gravada cujo frasco foi apagado: vai como frasco_id null, que _decant_inalterado aceita
export function origemParaJson(o: Origem): { frasco_id?: string | null; abrir_produto_id?: string; ml: number } {
  return o.tipo === 'frasco' ? { frasco_id: o.frascoId || null, ml: o.ml } : { abrir_produto_id: o.produtoId, ml: o.ml }
}

export interface FrascoEstado extends FrascoAtivo { ativo: boolean }
export interface Devolucao { frascoId: string; ml: number; semTeto?: boolean }

// Espelha _devolver_origens (e o item antigo sem decant do cancelar_venda, semTeto): a origem
// volta ao frasco ativo do mesmo perfume quando o seu não está ativo; teto = ml_total; reativa.
export function aplicarDevolucoes(frascos: FrascoEstado[], devolucoes: Devolucao[]): FrascoEstado[] {
  const estado = frascos.map((f) => ({ ...f }))
  for (const d of devolucoes) {
    const origem = estado.find((f) => f.id === d.frascoId)
    if (!origem) continue
    const alvo = origem.ativo || d.semTeto ? origem : estado.find((f) => f.produtoId === origem.produtoId && f.ativo) ?? origem
    const soma = new Decimal(alvo.mlRestante).add(d.ml)
    alvo.mlRestante = (d.semTeto ? soma : Decimal.min(soma, alvo.mlTotal)).toNumber()
    alvo.ativo = true
  }
  return estado
}

// produtoId sem frasco escolhido: perfume sem frasco aberto, sai de um lacrado
export interface PedidoDecant { frascoId: string; produtoId?: string; ml: number; origens: Origem[] | null; jaConsumido?: boolean }
export interface PlanoDecant { origens: Origem[]; frasco?: FrascoEstado; frascos: FrascoEstado[] }

// Planeja os decants na ordem em que a RPC os consome: cada item vê os frascos e lacrados já
// usados pelos anteriores. Origens dadas (completadas/gravadas) são respeitadas; jaConsumido =
// decant gravado que fica como está (os ml dele já saíram dos frascos).
// O frasco aberto por um item fica com id '': a RPC não tem como referenciá-lo, então ele só
// impede outro 'abrir' do perfume e o item seguinte fica com falta (completar com outro perfume).
export function planejarDecants(
  frascos: FrascoEstado[], lacrados: Record<string, number>, volumes: Record<string, number>, pedidos: PedidoDecant[],
): PlanoDecant[] {
  const estado = frascos.map((f) => ({ ...f }))
  const sobra = { ...lacrados }
  return pedidos.map((p) => {
    const antes = estado.map((f) => ({ ...f }))
    const escolhido = antes.find((f) => f.id === p.frascoId)
    const frasco = escolhido && !escolhido.ativo ? antes.find((f) => f.produtoId === escolhido.produtoId && f.ativo) ?? escolhido : escolhido
    let origens = p.origens ?? []
    if (!p.origens && frasco && frasco.id !== '' && p.ml > 0) {
      const aberto = frasco.ativo ? frasco : null
      const pid = frasco.produtoId
      origens = planejarOrigens(p.ml, aberto, pid, sobra[pid] ?? 0, volumes[pid] ?? 0)
        ?? (aberto && planejarOrigens(Decimal.min(p.ml, Math.max(aberto.mlRestante, 0)).toNumber(), aberto, pid, 0, 0))
        ?? []
    } else if (!p.origens && !escolhido && p.produtoId && p.ml > 0) {
      origens = planejarOrigens(p.ml, null, p.produtoId, sobra[p.produtoId] ?? 0, volumes[p.produtoId] ?? 0) ?? []
    }
    if (!p.jaConsumido) {
      for (const o of origens) {
        if (o.tipo === 'frasco') {
          const f = estado.find((x) => x.id === o.frascoId)
          if (!f) continue
          f.mlRestante = new Decimal(f.mlRestante).sub(o.ml).toNumber()
          if (f.mlRestante <= 0) f.ativo = false
        } else {
          sobra[o.produtoId] = (sobra[o.produtoId] ?? 0) - 1
          const vol = volumes[o.produtoId] ?? 0
          const resto = new Decimal(vol).sub(o.ml).toNumber()
          estado.push({ id: '', produtoId: o.produtoId, mlTotal: vol, mlRestante: resto, ativo: resto > 0 })
        }
      }
    }
    return { origens, frasco, frascos: antes }
  })
}
