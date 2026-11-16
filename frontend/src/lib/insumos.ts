import Decimal from 'decimal.js'

export type TipoLista = 'decant' | 'frasco' | 'envio_decant' | 'envio_frasco'
export interface ItemInsumo { insumoId: string; quantidade: number }
export interface ListaInsumos { tipo: TipoLista; tamanhoMl: number | null; itens: ItemInsumo[] }
export interface ResultadoCompra { diferenca: number; novoEstoque: number; novoCustoMedio: number; custoUnitarioCompra: number }

export function aplicarCompra(
  saldoSistema: number, custoMedioAtual: number, saldoContado: number, qtdComprada: number, valorTotal: number,
): ResultadoCompra {
  if (qtdComprada <= 0) throw new Error('Quantidade comprada deve ser maior que zero')
  const contado = new Decimal(Math.max(saldoContado, 0))
  const novoEstoque = contado.add(qtdComprada)
  return {
    diferenca: new Decimal(saldoContado).sub(saldoSistema).toNumber(),
    novoEstoque: novoEstoque.toNumber(),
    novoCustoMedio: contado.mul(custoMedioAtual).add(valorTotal).div(novoEstoque).toDecimalPlaces(4).toNumber(),
    custoUnitarioCompra: new Decimal(valorTotal).div(qtdComprada).toDecimalPlaces(4).toNumber(),
  }
}

export interface ListaDb { tipo: TipoLista; tamanho_ml: number | null; insumo_lista_itens: { insumo_id: string; quantidade: number }[] | null }

// Listas como vêm do banco, sem os insumos inativos: não são pré-preenchidos nem consumidos.
export function listasAtivas(linhas: ListaDb[], insumos: { id: string; ativo: boolean }[]): ListaInsumos[] {
  const ativos = new Set(insumos.filter((i) => i.ativo).map((i) => i.id))
  return linhas.map((x) => ({
    tipo: x.tipo,
    tamanhoMl: x.tamanho_ml != null ? Number(x.tamanho_ml) : null,
    itens: (x.insumo_lista_itens ?? []).filter((i) => ativos.has(i.insumo_id))
      .map((i) => ({ insumoId: i.insumo_id, quantidade: Number(i.quantidade) })),
  }))
}

function multiplicar(itens: ItemInsumo[], quantidade: number): ItemInsumo[] {
  return itens.map((i) => ({ insumoId: i.insumoId, quantidade: new Decimal(i.quantidade).mul(quantidade).toNumber() }))
}

export function listaDoItem(
  listas: ListaInsumos[], tipo: 'produto' | 'decant', ml: number | null, quantidade: number,
): ItemInsumo[] {
  const lista = tipo === 'produto'
    ? listas.find((l) => l.tipo === 'frasco')
    : listas.find((l) => l.tipo === 'decant' && l.tamanhoMl === ml)
  return lista ? multiplicar(lista.itens, quantidade) : []
}

export function listaEnvio(
  listas: ListaInsumos[], tiposItens: Array<'produto' | 'decant'>, canalUsaEnvio: boolean,
): ItemInsumo[] {
  if (!canalUsaEnvio || tiposItens.length === 0) return []
  const tipo: TipoLista = tiposItens.includes('produto') ? 'envio_frasco' : 'envio_decant'
  return listas.find((l) => l.tipo === tipo)?.itens.map((i) => ({ ...i })) ?? []
}

export function somarItens(...grupos: ItemInsumo[][]): ItemInsumo[] {
  const total = new Map<string, Decimal>()
  for (const i of grupos.flat()) total.set(i.insumoId, (total.get(i.insumoId) ?? new Decimal(0)).add(i.quantidade))
  return [...total].map(([insumoId, q]) => ({ insumoId, quantidade: q.toNumber() }))
}

export function custoInsumos(itens: ItemInsumo[], custoPorInsumo: Record<string, number>): number {
  return itens
    .reduce((s, i) => s.add(new Decimal(i.quantidade).mul(custoPorInsumo[i.insumoId] ?? 0)), new Decimal(0))
    .toDecimalPlaces(2).toNumber()
}

export function abaixoDoMinimo(estoqueAtual: number, estoqueMinimo: number): boolean {
  return estoqueMinimo > 0 && estoqueAtual < estoqueMinimo
}
