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
