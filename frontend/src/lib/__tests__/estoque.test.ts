import { describe, it, expect } from 'vitest'
import { situacaoEstoque, ordenarProdutos } from '../estoque'

describe('situacaoEstoque', () => {
  it('ok quando estoque_atual > estoque_minimo', () => {
    expect(situacaoEstoque(5, 3)).toBe('ok')
    expect(situacaoEstoque(4, 3)).toBe('ok')
  })

  it('baixo quando estoque_atual <= estoque_minimo mas acima do critico', () => {
    expect(situacaoEstoque(3, 3)).toBe('baixo') // ceil(3*0.5)=2, 3>2, 3<=3 → baixo
    expect(situacaoEstoque(3, 4)).toBe('baixo') // ceil(4*0.5)=2, 3>2, 3<=4 → baixo
  })

  it('critico quando estoque_atual <= ceil(estoque_minimo * 0.5)', () => {
    expect(situacaoEstoque(2, 3)).toBe('critico') // ceil(1.5)=2, 2<=2 → critico
    expect(situacaoEstoque(1, 3)).toBe('critico')
  })

  it('ok quando estoque_minimo = 0 (sem mínimo definido)', () => {
    expect(situacaoEstoque(1, 0)).toBe('ok') // ceil(0)=0, 1>0 → ok
  })
})

describe('ordenarProdutos', () => {
  const prods = [
    { nome: 'Zebra', estoque_atual: 3 },
    { nome: 'Alfa', estoque_atual: 10 },
    { nome: 'Meio', estoque_atual: 5 },
  ]

  it('qty_desc: maior para menor', () => {
    expect(ordenarProdutos(prods, 'qty_desc').map(p => p.estoque_atual)).toEqual([10, 5, 3])
  })

  it('qty_asc: menor para maior', () => {
    expect(ordenarProdutos(prods, 'qty_asc').map(p => p.estoque_atual)).toEqual([3, 5, 10])
  })

  it('az: ordem alfabética', () => {
    expect(ordenarProdutos(prods, 'az').map(p => p.nome)).toEqual(['Alfa', 'Meio', 'Zebra'])
  })

  it('za: ordem alfabética invertida', () => {
    expect(ordenarProdutos(prods, 'za').map(p => p.nome)).toEqual(['Zebra', 'Meio', 'Alfa'])
  })

  it('não muta o array original', () => {
    const original = prods.map(p => ({ ...p }))
    ordenarProdutos(prods, 'qty_asc')
    expect(prods).toEqual(original)
  })
})
