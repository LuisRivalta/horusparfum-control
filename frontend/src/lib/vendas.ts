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
