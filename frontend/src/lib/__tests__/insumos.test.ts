import { describe, it, expect } from 'vitest'
import { aplicarCompra, listaDoItem, listaEnvio, somarItens, custoInsumos, abaixoDoMinimo, listasAtivas, type ListaInsumos } from '../insumos'

describe('aplicarCompra', () => {
  it('compra sem diferença: 1000 por R$ 2.000 em estoque zerado', () => {
    expect(aplicarCompra(0, 0, 0, 1000, 2000)).toEqual({ diferenca: 0, novoEstoque: 1000, novoCustoMedio: 2, custoUnitarioCompra: 2 })
  })
  it('sistema achava 40, sobraram 5: diferença -35 e média sobre o saldo contado', () => {
    const r = aplicarCompra(40, 0.1, 5, 200, 30)
    expect(r.diferenca).toBe(-35)
    expect(r.novoEstoque).toBe(205)
    expect(r.novoCustoMedio).toBe(0.1488) // (5*0.1 + 30) / 205, 4 casas
  })
  it('contado maior que o sistema vira diferença positiva', () => {
    expect(aplicarCompra(10, 1, 12, 10, 20).diferenca).toBe(2)
  })
  it('recusa quantidade comprada <= 0', () => {
    expect(() => aplicarCompra(0, 0, 0, 0, 10)).toThrow()
  })
})
describe('listas', () => {
  const listas = [
    { tipo: 'decant', tamanhoMl: 5, itens: [{ insumoId: 'frasq5', quantidade: 1 }, { insumoId: 'adesivo', quantidade: 1 }] },
    { tipo: 'frasco', tamanhoMl: null, itens: [{ insumoId: 'saco', quantidade: 1 }] },
    { tipo: 'envio_decant', tamanhoMl: null, itens: [{ insumoId: 'caixinha', quantidade: 1 }] },
    { tipo: 'envio_frasco', tamanhoMl: null, itens: [{ insumoId: 'caixa', quantidade: 1 }] },
  ] as ListaInsumos[]
  it('lista do item multiplica pela quantidade', () => {
    expect(listaDoItem(listas, 'decant', 5, 3)).toEqual([{ insumoId: 'frasq5', quantidade: 3 }, { insumoId: 'adesivo', quantidade: 3 }])
  })
  it('tamanho sem lista devolve vazio', () => { expect(listaDoItem(listas, 'decant', 10, 1)).toEqual([]) })
  it('envio de frasco quando a venda tem frasco cheio', () => {
    expect(listaEnvio(listas, ['decant', 'produto'], true)).toEqual([{ insumoId: 'caixa', quantidade: 1 }])
  })
  it('envio de decant quando só tem decant', () => {
    expect(listaEnvio(listas, ['decant', 'decant'], true)).toEqual([{ insumoId: 'caixinha', quantidade: 1 }])
  })
  it('canal sem envio não usa kit', () => { expect(listaEnvio(listas, ['produto'], false)).toEqual([]) })
  it('somarItens junta o mesmo insumo', () => {
    expect(somarItens([{ insumoId: 'a', quantidade: 1 }], [{ insumoId: 'a', quantidade: 2 }, { insumoId: 'b', quantidade: 1 }]))
      .toEqual([{ insumoId: 'a', quantidade: 3 }, { insumoId: 'b', quantidade: 1 }])
  })
  it('custoInsumos com 2 casas', () => {
    expect(custoInsumos([{ insumoId: 'a', quantidade: 3 }], { a: 0.1488 })).toBe(0.45)
  })
  it('abaixoDoMinimo só quando mínimo > 0', () => {
    expect(abaixoDoMinimo(2, 5)).toBe(true); expect(abaixoDoMinimo(0, 0)).toBe(false)
  })
})

describe('listasAtivas', () => {
  it('tira os insumos inativos e converte os números', () => {
    const r = listasAtivas(
      [{ tipo: 'decant', tamanho_ml: '5' as unknown as number, insumo_lista_itens: [{ insumo_id: 'a', quantidade: 1 }, { insumo_id: 'b', quantidade: 2 }] }],
      [{ id: 'a', ativo: true }, { id: 'b', ativo: false }],
    )
    expect(r).toEqual([{ tipo: 'decant', tamanhoMl: 5, itens: [{ insumoId: 'a', quantidade: 1 }] }])
  })
})
