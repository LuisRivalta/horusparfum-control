import { describe, it, expect } from 'vitest'
import {
  resumoEstoque,
  agruparEstoque,
  topProdutosPorValor,
  type ProdutoEstoque,
} from '../estoqueDashboard'

function produto(over: Partial<ProdutoEstoque> = {}): ProdutoEstoque {
  return {
    id: 'p1',
    nome: 'Produto',
    estoque_atual: 10,
    estoque_minimo: 2,
    custo_medio: 100,
    categoria_id: 'c1',
    marca_id: 'm1',
    ...over,
  }
}

describe('resumoEstoque', () => {
  it('conta produtos e unidades separadamente', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 3 }),
      produto({ id: 'p2', estoque_atual: 5 }),
    ])

    expect(r.produtos).toBe(2)
    expect(r.unidades).toBe(8)
  })

  it('soma valor do estoque como estoque_atual x custo_medio', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 3, custo_medio: 150.5 }),
      produto({ id: 'p2', estoque_atual: 2, custo_medio: 99.9 }),
    ])

    expect(r.valorTotal).toBeCloseTo(3 * 150.5 + 2 * 99.9, 2)
  })

  it('não acumula erro de ponto flutuante no valor', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 1, custo_medio: 0.1 }),
      produto({ id: 'p2', estoque_atual: 1, custo_medio: 0.2 }),
    ])

    expect(r.valorTotal).toBe(0.3)
  })

  it('trata custo_medio nulo ou zero como valor zero e conta em semCusto', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 4, custo_medio: null }),
      produto({ id: 'p2', estoque_atual: 4, custo_medio: 0 }),
      produto({ id: 'p3', estoque_atual: 4, custo_medio: 50 }),
    ])

    expect(r.valorTotal).toBe(200)
    expect(r.semCusto).toBe(2)
    expect(r.unidades).toBe(12)
  })

  it('classifica críticos e baixos pela regra de situacaoEstoque', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 1, estoque_minimo: 4 }),
      produto({ id: 'p2', estoque_atual: 3, estoque_minimo: 4 }),
      produto({ id: 'p3', estoque_atual: 9, estoque_minimo: 4 }),
    ])

    expect(r.criticos).toBe(1)
    expect(r.baixos).toBe(1)
    expect(r.ok).toBe(1)
  })

  it('custo médio por unidade divide valor total pelas unidades', () => {
    const r = resumoEstoque([
      produto({ id: 'p1', estoque_atual: 2, custo_medio: 100 }),
      produto({ id: 'p2', estoque_atual: 2, custo_medio: 300 }),
    ])

    expect(r.custoMedioUnidade).toBeCloseTo(200, 2)
  })

  it('lista vazia devolve zeros sem divisão por zero', () => {
    const r = resumoEstoque([])

    expect(r.produtos).toBe(0)
    expect(r.unidades).toBe(0)
    expect(r.valorTotal).toBe(0)
    expect(r.custoMedioUnidade).toBeNull()
  })
})

describe('agruparEstoque', () => {
  const produtos = [
    produto({ id: 'p1', categoria_id: 'c1', estoque_atual: 2, custo_medio: 100 }),
    produto({ id: 'p2', categoria_id: 'c1', estoque_atual: 3, custo_medio: 100 }),
    produto({ id: 'p3', categoria_id: 'c2', estoque_atual: 5, custo_medio: 40 }),
  ]
  const nomes = new Map([
    ['c1', 'Masculino'],
    ['c2', 'Feminino'],
  ])

  it('agrupa contando produtos, unidades e valor por grupo', () => {
    const linhas = agruparEstoque(produtos, (p) => p.categoria_id, nomes)
    const masculino = linhas.find((l) => l.nome === 'Masculino')

    expect(masculino).toMatchObject({ produtos: 2, unidades: 5, valor: 500 })
  })

  it('ordena por valor decrescente', () => {
    const linhas = agruparEstoque(produtos, (p) => p.categoria_id, nomes)

    expect(linhas.map((l) => l.nome)).toEqual(['Masculino', 'Feminino'])
  })

  it('calcula participação de cada grupo no valor total', () => {
    const linhas = agruparEstoque(produtos, (p) => p.categoria_id, nomes)

    expect(linhas[0].participacao).toBeCloseTo(500 / 700, 4)
    expect(linhas[1].participacao).toBeCloseTo(200 / 700, 4)
  })

  it('agrupa produtos sem grupo definido em "Sem categoria"', () => {
    const linhas = agruparEstoque(
      [produto({ id: 'p1', categoria_id: null })],
      (p) => p.categoria_id,
      nomes,
      'Sem categoria'
    )

    expect(linhas[0].nome).toBe('Sem categoria')
    expect(linhas[0].id).toBeNull()
  })

  it('usa o rótulo de fallback quando o id não está no mapa de nomes', () => {
    const linhas = agruparEstoque(
      [produto({ id: 'p1', categoria_id: 'desconhecido' })],
      (p) => p.categoria_id,
      nomes,
      'Sem categoria'
    )

    expect(linhas[0].nome).toBe('Sem categoria')
  })

  it('participação é zero quando nenhum grupo tem valor', () => {
    const linhas = agruparEstoque(
      [produto({ id: 'p1', custo_medio: null })],
      (p) => p.categoria_id,
      nomes
    )

    expect(linhas[0].valor).toBe(0)
    expect(linhas[0].participacao).toBe(0)
  })
})

describe('topProdutosPorValor', () => {
  it('ordena por valor em estoque decrescente e limita a quantidade', () => {
    const linhas = topProdutosPorValor(
      [
        produto({ id: 'p1', nome: 'Barato', estoque_atual: 1, custo_medio: 10 }),
        produto({ id: 'p2', nome: 'Caro', estoque_atual: 2, custo_medio: 500 }),
        produto({ id: 'p3', nome: 'Medio', estoque_atual: 3, custo_medio: 50 }),
      ],
      2
    )

    expect(linhas.map((l) => l.nome)).toEqual(['Caro', 'Medio'])
    expect(linhas[0].valor).toBe(1000)
  })

  it('ignora produtos sem valor em estoque', () => {
    const linhas = topProdutosPorValor(
      [
        produto({ id: 'p1', nome: 'Sem custo', custo_medio: null }),
        produto({ id: 'p2', nome: 'Com custo', estoque_atual: 1, custo_medio: 20 }),
      ],
      5
    )

    expect(linhas.map((l) => l.nome)).toEqual(['Com custo'])
  })

  it('calcula participação sobre o valor total do estoque, não sobre o top', () => {
    const linhas = topProdutosPorValor(
      [
        produto({ id: 'p1', nome: 'A', estoque_atual: 1, custo_medio: 600 }),
        produto({ id: 'p2', nome: 'B', estoque_atual: 1, custo_medio: 300 }),
        produto({ id: 'p3', nome: 'C', estoque_atual: 1, custo_medio: 100 }),
      ],
      1
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0].participacao).toBeCloseTo(0.6, 4)
  })
})
