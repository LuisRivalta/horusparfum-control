import { describe, it, expect } from 'vitest'
import {
  calcularGiroProduto,
  calcularGiroDecant,
  resumoGiro,
  ordenarGiro,
  type LinhaGiro,
} from '../giro'

describe('calcularGiroProduto', () => {
  it('caso normal: reconstrói estoque inicial e calcula giro/cobertura', () => {
    const r = calcularGiroProduto(5, [
      { tipo: 'saida', quantidade: 6 },
      { tipo: 'saida', quantidade: 4 },
    ], 30)

    expect(r.saidas).toBe(10)
    expect(r.entradas).toBe(0)
    expect(r.estoqueInicio).toBe(15)
    expect(r.estoqueMedio).toBe(10)
    expect(r.giro).toBeCloseTo(1)
    expect(r.coberturaDias).toBeCloseTo(15)
    expect(r.parado).toBe(false)
  })

  it('considera entradas na reconstrução do estoque inicial', () => {
    const r = calcularGiroProduto(8, [
      { tipo: 'entrada', quantidade: 6 },
      { tipo: 'saida', quantidade: 4 },
    ], 30)

    expect(r.estoqueInicio).toBe(6)
    expect(r.estoqueMedio).toBe(7)
    expect(r.giro).toBeCloseTo(4 / 7)
    expect(r.coberturaDias).toBeCloseTo((8 * 30) / 4)
  })

  it('produto parado: estoque > 0 e zero saída', () => {
    const r = calcularGiroProduto(5, [], 30)

    expect(r.saidas).toBe(0)
    expect(r.parado).toBe(true)
    expect(r.giro).toBe(0)
    expect(r.coberturaDias).toBeNull()
  })

  it('estoque médio <= 0 retorna giro null', () => {
    const r = calcularGiroProduto(0, [], 30)

    expect(r.estoqueMedio).toBe(0)
    expect(r.giro).toBeNull()
    expect(r.parado).toBe(false)
  })
})

describe('calcularGiroDecant', () => {
  it('cobertura por ml e parado quando sem consumo', () => {
    expect(calcularGiroDecant(50, 0, 30)).toEqual({ coberturaDias: null, parado: true })
  })

  it('cobertura = mlRestante * dias / mlConsumido', () => {
    const r = calcularGiroDecant(60, 30, 30)

    expect(r.coberturaDias).toBeCloseTo(60)
    expect(r.parado).toBe(false)
  })
})

describe('resumoGiro', () => {
  const linhas: LinhaGiro[] = [
    { estoqueAtual: 5, custoMedio: 100, giro: 2, coberturaDias: 10, parado: false },
    { estoqueAtual: 3, custoMedio: 50, giro: 0, coberturaDias: null, parado: true },
    { estoqueAtual: 4, custoMedio: 20, giro: null, coberturaDias: null, parado: false },
  ]

  it('giroMedio e coberturaMedia ignoram nulls', () => {
    const r = resumoGiro(linhas)

    expect(r.giroMedio).toBeCloseTo(1)
    expect(r.coberturaMedia).toBeCloseTo(10)
  })

  it('qtdParados conta os parados e valorEncalhado soma estoque*custo dos parados', () => {
    const r = resumoGiro(linhas)

    expect(r.qtdParados).toBe(1)
    expect(r.valorEncalhado).toBeCloseTo(150)
  })

  it('listas sem valores definidos retornam médias null', () => {
    const r = resumoGiro([{ estoqueAtual: 4, custoMedio: 20, giro: null, coberturaDias: null, parado: false }])

    expect(r.giroMedio).toBeNull()
    expect(r.coberturaMedia).toBeNull()
    expect(r.valorEncalhado).toBe(0)
  })
})

describe('ordenarGiro', () => {
  const linhas = [
    { nome: 'B', giro: 1, coberturaDias: 30, saidas: 2 },
    { nome: 'A', giro: 3, coberturaDias: 10, saidas: 5 },
    { nome: 'C', giro: null, coberturaDias: null, saidas: 0 },
  ]

  it('giro_desc: maior giro primeiro, null por último', () => {
    expect(ordenarGiro(linhas, 'giro_desc').map((l) => l.nome)).toEqual(['A', 'B', 'C'])
  })

  it('cobertura_asc: menor cobertura primeiro, null por último', () => {
    expect(ordenarGiro(linhas, 'cobertura_asc').map((l) => l.nome)).toEqual(['A', 'B', 'C'])
  })

  it('saidas_desc: mais saídas primeiro', () => {
    expect(ordenarGiro(linhas, 'saidas_desc').map((l) => l.nome)).toEqual(['A', 'B', 'C'])
  })

  it('az: ordem alfabética', () => {
    expect(ordenarGiro(linhas, 'az').map((l) => l.nome)).toEqual(['A', 'B', 'C'])
  })

  it('não muta o array original', () => {
    const orig = linhas.map((l) => ({ ...l }))

    ordenarGiro(linhas, 'giro_desc')

    expect(linhas).toEqual(orig)
  })
})
