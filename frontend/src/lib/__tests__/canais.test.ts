import { describe, expect, it } from 'vitest'
import { linhasDoPedido, precoShopify, type PedidoCanal } from '../canais'

describe('precoShopify', () => {
  it('arredonda para cima na grade ,90 com a taxa', () => expect(precoShopify(50, 0.6, 3.5)).toBe(83.9))
  it('sem taxa', () => expect(precoShopify(50, 0.6, 0)).toBe(80.9))
  it('já em ,90 não sobe', () => expect(precoShopify(50.9, 0, 0)).toBe(50.9))
  it('mínimo 8,90', () => expect(precoShopify(1, 0.6, 0)).toBe(8.9))
  it('taxa 100 lança', () => expect(() => precoShopify(50, 0.6, 100)).toThrow('Taxa do canal inválida'))
})

const pedido = (itens: PedidoCanal['itens']) => ({ itens } as PedidoCanal)

describe('linhasDoPedido', () => {
  it('frasco vira produto, decant leva ml, sem produto fica vazio', () => {
    const base = { variante_id: 'v', titulo: 't' }
    expect(linhasDoPedido(pedido([
      { ...base, quantidade: 2, preco_unitario: 99.9, produto_id: 'p1', tipo: 'frasco', ml: null },
      { ...base, quantidade: 1, preco_unitario: 29.9, produto_id: 'p1', tipo: 'decant', ml: 5 },
      { ...base, quantidade: 3, preco_unitario: 10, produto_id: null, tipo: null, ml: null },
    ]))).toEqual([
      { tipo: 'produto', produto_id: 'p1', ml: '', quantidade: '2', preco: '99.9' },
      { tipo: 'decant', produto_id: 'p1', ml: '5', quantidade: '1', preco: '29.9' },
      { tipo: 'produto', produto_id: '', ml: '', quantidade: '3', preco: '10' },
    ])
  })
})
