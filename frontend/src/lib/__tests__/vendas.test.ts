import { describe, it, expect } from 'vitest'
import {
  custoDecantUnitario, brutoItem, custoItem, roi, margem,
  type ItemVenda,
} from '../vendas'

const produto = (over: Partial<ItemVenda> = {}): ItemVenda => ({
  tipo: 'produto', quantidade: 1, precoUnitario: 0, custoUnitario: 0, custoEmbalagem: 0, ...over,
})

describe('custoDecantUnitario', () => {
  it('é proporcional ao ml sobre o volume da garrafa', () => {
    // 5ml de uma garrafa de 100ml que custou 200 → 10.00
    expect(custoDecantUnitario(5, 200, 100)).toBe(10)
  })
  it('retorna 0 quando o volume é 0 (evita divisão por zero)', () => {
    expect(custoDecantUnitario(5, 200, 0)).toBe(0)
  })
  it('arredonda para 2 casas', () => {
    expect(custoDecantUnitario(3, 100, 7)).toBe(42.86)
  })
})

describe('brutoItem', () => {
  it('multiplica preço por quantidade', () => {
    expect(brutoItem(produto({ precoUnitario: 120, quantidade: 2 }))).toBe(240)
  })
})

describe('custoItem', () => {
  it('soma custo unitário e embalagem, vezes quantidade', () => {
    expect(custoItem(produto({ custoUnitario: 30, custoEmbalagem: 2, quantidade: 3 }))).toBe(96)
  })
})

describe('roi', () => {
  it('é lucro dividido pelo custo', () => {
    expect(roi(50, 100)).toBe(0.5)
  })
  it('retorna null quando custo é 0 (indefinido)', () => {
    expect(roi(50, 0)).toBeNull()
  })
})

describe('margem', () => {
  it('é lucro dividido pelo bruto', () => {
    expect(margem(30, 120)).toBe(0.25)
  })
  it('retorna 0 quando bruto é 0', () => {
    expect(margem(30, 0)).toBe(0)
  })
})

import { ratearProporcional, lucroItem, resumoVenda } from '../vendas'

describe('ratearProporcional', () => {
  it('rateia proporcional aos pesos e o último absorve a sobra de centavos', () => {
    // 10 entre [1,1,1] → 3.33 + 3.33 + 3.34 = 10.00 exato
    expect(ratearProporcional(10, [1, 1, 1])).toEqual([3.33, 3.33, 3.34])
  })
  it('rateia proporcional a pesos diferentes', () => {
    expect(ratearProporcional(100, [30, 70])).toEqual([30, 70])
  })
  it('retorna zeros quando a soma dos pesos é 0', () => {
    expect(ratearProporcional(50, [0, 0])).toEqual([0, 0])
  })
  it('devolve o total inteiro quando há um só item', () => {
    expect(ratearProporcional(42.5, [5])).toEqual([42.5])
  })
  it('retorna lista vazia quando não há itens', () => {
    expect(ratearProporcional(10, [])).toEqual([])
  })
})

describe('lucroItem', () => {
  it('é bruto menos taxa rateada, frete rateado e custo', () => {
    const item: ItemVenda = {
      tipo: 'produto', quantidade: 1, precoUnitario: 200, custoUnitario: 120, custoEmbalagem: 0,
    }
    // 200 - 20 (taxa) - 5 (frete) - 120 (custo) = 55
    expect(lucroItem(item, 20, 5)).toBe(55)
  })
})

describe('resumoVenda', () => {
  it('soma bruto/custo, desconta taxa+frete e calcula lucro, ROI e margem', () => {
    const itens: ItemVenda[] = [
      { tipo: 'produto', quantidade: 1, precoUnitario: 200, custoUnitario: 120, custoEmbalagem: 0 },
      { tipo: 'decant', quantidade: 1, precoUnitario: 40, custoUnitario: 10, custoEmbalagem: 2 },
    ]
    const r = resumoVenda(itens, 24, 6)
    expect(r.totalBruto).toBe(240)
    expect(r.totalCusto).toBe(132)        // 120 + (10+2)
    expect(r.receitaLiquida).toBe(210)    // 240 - 24 - 6
    expect(r.lucroBruto).toBe(78)         // 210 - 132
    expect(r.roi).toBe(0.5909)            // 78 / 132
    expect(r.margem).toBe(0.325)          // 78 / 240
  })
  it('lida com taxa 0 e frete 0 (loja física)', () => {
    const itens: ItemVenda[] = [
      { tipo: 'produto', quantidade: 2, precoUnitario: 100, custoUnitario: 60, custoEmbalagem: 0 },
    ]
    const r = resumoVenda(itens, 0, 0)
    expect(r.totalBruto).toBe(200)
    expect(r.lucroBruto).toBe(80)         // 200 - 120
    expect(r.roi).toBe(0.6667)
  })
})
