import { describe, it, expect } from 'vitest'
import {
  calcularCustoMedio,
  calcularTotalPedido,
  validarConferencia,
  DIVERGENCIA_TIPOS,
  type ConferenciaItem,
} from '../pedidos'

describe('calcularCustoMedio', () => {
  it('faz a média ponderada entre estoque atual e lote recebido', () => {
    // 1 un. a R$100 em estoque + 3 un. a R$130 chegando = R$122,50
    expect(calcularCustoMedio(1, 100, 3, 130)).toBe(122.5)
  })

  it('assume o preço do pedido quando o produto não tem custo ainda', () => {
    expect(calcularCustoMedio(5, null, 3, 130)).toBe(130)
  })

  it('assume o preço do pedido quando o estoque atual é zero', () => {
    expect(calcularCustoMedio(0, 100, 3, 130)).toBe(130)
  })

  it('arredonda para 2 casas decimais', () => {
    expect(calcularCustoMedio(3, 10, 3, 11)).toBe(10.5)
    expect(calcularCustoMedio(1, 100, 2, 101)).toBe(100.67)
  })
})

describe('calcularTotalPedido', () => {
  it('soma qtd × preço de cada item', () => {
    expect(calcularTotalPedido([
      { qtd: 5, preco: 100 },
      { qtd: 3, preco: 130 },
    ])).toBe(890)
  })

  it('retorna 0 para lista vazia', () => {
    expect(calcularTotalPedido([])).toBe(0)
  })
})

describe('validarConferencia', () => {
  const itemOk: ConferenciaItem = {
    itemId: 'a', qtdPedida: 5, qtdRecebida: 5, divergenciaTipo: null, divergenciaObs: '',
  }

  it('passa quando todas as quantidades batem', () => {
    expect(validarConferencia([itemOk])).toEqual([])
  })

  it('exige tipo de divergência quando a qtd recebida difere da pedida', () => {
    const erros = validarConferencia([
      { ...itemOk, qtdRecebida: 3, divergenciaTipo: null },
    ])
    expect(erros).toHaveLength(1)
    expect(erros[0]).toMatch(/divergência/i)
  })

  it('passa quando a qtd difere mas a divergência está classificada', () => {
    expect(validarConferencia([
      { ...itemOk, qtdRecebida: 3, divergenciaTipo: 'faltou' },
    ])).toEqual([])
  })

  it('rejeita qtd recebida negativa', () => {
    const erros = validarConferencia([
      { ...itemOk, qtdRecebida: -1, divergenciaTipo: 'faltou' },
    ])
    expect(erros).toHaveLength(1)
  })
})

describe('DIVERGENCIA_TIPOS', () => {
  it('contém os 4 tipos do spec', () => {
    expect(DIVERGENCIA_TIPOS.map(t => t.value)).toEqual(
      ['faltou', 'veio_a_mais', 'avariado', 'produto_errado']
    )
  })
})
