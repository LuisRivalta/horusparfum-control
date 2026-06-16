import Decimal from 'decimal.js'

export interface ItemVenda {
  tipo: 'produto' | 'decant'
  quantidade: number
  precoUnitario: number   // bruto, por unidade
  custoUnitario: number   // snapshot por unidade (só perfume, no caso do decant)
  custoEmbalagem: number  // por unidade; 0 para produto
}

export interface ResumoVenda {
  totalBruto: number
  totalCusto: number
  receitaLiquida: number
  lucroBruto: number
  roi: number | null   // null quando custo = 0
  margem: number       // 0 quando bruto = 0
}

export function custoDecantUnitario(ml: number, custoMedio: number, volumeMl: number): number {
  if (volumeMl <= 0) return 0
  return new Decimal(ml).mul(custoMedio).div(volumeMl).toDecimalPlaces(2).toNumber()
}

export function brutoItem(item: ItemVenda): number {
  return new Decimal(item.precoUnitario).mul(item.quantidade).toDecimalPlaces(2).toNumber()
}

export function custoItem(item: ItemVenda): number {
  return new Decimal(item.custoUnitario).add(item.custoEmbalagem)
    .mul(item.quantidade).toDecimalPlaces(2).toNumber()
}

export function roi(lucro: number, custo: number): number | null {
  if (custo <= 0) return null
  return new Decimal(lucro).div(custo).toDecimalPlaces(4).toNumber()
}

export function margem(lucro: number, bruto: number): number {
  if (bruto <= 0) return 0
  return new Decimal(lucro).div(bruto).toDecimalPlaces(4).toNumber()
}

export function ratearProporcional(valorTotal: number, pesos: number[]): number[] {
  const n = pesos.length
  if (n === 0) return []
  const soma = pesos.reduce((acc, p) => acc.add(p), new Decimal(0))
  if (soma.lte(0)) return pesos.map(() => 0)

  const total = new Decimal(valorTotal)
  let acumulado = new Decimal(0)
  const parcelas: number[] = []
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      const parcela = total.mul(pesos[i]).div(soma).toDecimalPlaces(2)
      acumulado = acumulado.add(parcela)
      parcelas.push(parcela.toNumber())
    } else {
      parcelas.push(total.sub(acumulado).toDecimalPlaces(2).toNumber())
    }
  }
  return parcelas
}

export function lucroItem(item: ItemVenda, taxaRateada: number, freteRateado: number): number {
  return new Decimal(brutoItem(item))
    .sub(taxaRateada).sub(freteRateado).sub(custoItem(item))
    .toDecimalPlaces(2).toNumber()
}

export function resumoVenda(itens: ItemVenda[], taxaTotal: number, frete: number): ResumoVenda {
  const totalBruto = itens.reduce((acc, it) => acc.add(brutoItem(it)), new Decimal(0)).toDecimalPlaces(2)
  const totalCusto = itens.reduce((acc, it) => acc.add(custoItem(it)), new Decimal(0)).toDecimalPlaces(2)
  const receitaLiquida = totalBruto.sub(taxaTotal).sub(frete).toDecimalPlaces(2)
  const lucroBruto = receitaLiquida.sub(totalCusto).toDecimalPlaces(2)
  return {
    totalBruto: totalBruto.toNumber(),
    totalCusto: totalCusto.toNumber(),
    receitaLiquida: receitaLiquida.toNumber(),
    lucroBruto: lucroBruto.toNumber(),
    roi: roi(lucroBruto.toNumber(), totalCusto.toNumber()),
    margem: margem(lucroBruto.toNumber(), totalBruto.toNumber()),
  }
}
