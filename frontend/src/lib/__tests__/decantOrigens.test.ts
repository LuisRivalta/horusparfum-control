import { describe, it, expect } from 'vitest'
import { planejarOrigens, totalOrigens, custoPrevistoOrigens, origemParaJson, aplicarDevolucoes, type Origem } from '../decantOrigens'

const frasco = { id: 'f1', produtoId: 'p1', mlRestante: 4, mlTotal: 100 }

describe('planejarOrigens', () => {
  it('frasco aberto basta', () => {
    expect(planejarOrigens(2.5, frasco, 'p1', 0, 100)).toEqual([{ tipo: 'frasco', frascoId: 'f1', produtoId: 'p1', ml: 2.5 }])
  })
  it('sobra 4 ml, decant de 10: esgota o aberto e abre um lacrado', () => {
    expect(planejarOrigens(10, frasco, 'p1', 2, 100)).toEqual([
      { tipo: 'frasco', frascoId: 'f1', produtoId: 'p1', ml: 4 },
      { tipo: 'abrir', produtoId: 'p1', ml: 6 },
    ])
  })
  it('sem frasco aberto e com lacrado: só abrir', () => {
    expect(planejarOrigens(5, null, 'p1', 1, 100)).toEqual([{ tipo: 'abrir', produtoId: 'p1', ml: 5 }])
  })
  it('não basta e não há lacrado: null', () => { expect(planejarOrigens(10, frasco, 'p1', 0, 100)).toBeNull() })
  it('lacrado menor que o que falta: null', () => { expect(planejarOrigens(10, null, 'p1', 1, 5)).toBeNull() })
  it('frasco aberto vazio nunca gera origem com 0 ml', () => {
    expect(planejarOrigens(5, { ...frasco, mlRestante: 0 }, 'p1', 1, 100)).toEqual([{ tipo: 'abrir', produtoId: 'p1', ml: 5 }])
  })
  it('ml fracionário sem artefato de float', () => {
    expect(planejarOrigens(0.3, { ...frasco, mlRestante: 0.1 }, 'p1', 1, 100)).toEqual([
      { tipo: 'frasco', frascoId: 'f1', produtoId: 'p1', ml: 0.1 },
      { tipo: 'abrir', produtoId: 'p1', ml: 0.2 },
    ])
  })
})

describe('totais e custo', () => {
  const o = [{ tipo: 'frasco', frascoId: 'f1', produtoId: 'p1', ml: 4 }, { tipo: 'frasco', frascoId: 'f2', produtoId: 'p2', ml: 6 }] as Origem[]
  it('custo previsto soma origens de perfumes diferentes', () => {
    expect(custoPrevistoOrigens(o, { p1: 180, p2: 100 }, { p1: 100, p2: 100 })).toBe(13.2) // 7,20 + 6,00
  })
  it('totalOrigens', () => { expect(totalOrigens(o)).toBe(10) })
})

describe('origemParaJson', () => {
  it('abrir', () => {
    expect(origemParaJson({ tipo: 'abrir', produtoId: 'p1', ml: 6 })).toEqual({ abrir_produto_id: 'p1', ml: 6 })
  })
  it('frasco', () => {
    expect(origemParaJson({ tipo: 'frasco', frascoId: 'f1', produtoId: 'p1', ml: 4 })).toEqual({ frasco_id: 'f1', ml: 4 })
  })
})

describe('aplicarDevolucoes', () => {
  const f1 = { id: 'f1', produtoId: 'p1', mlRestante: 0, mlTotal: 100, ativo: false }
  const f9 = { id: 'f9', produtoId: 'p1', mlRestante: 94, mlTotal: 100, ativo: true }
  it('origem de frasco esgotado volta ao frasco ativo do perfume, com teto no ml_total', () => {
    const r = aplicarDevolucoes([f1, f9], [{ frascoId: 'f1', ml: 4 }, { frascoId: 'f9', ml: 6 }])
    expect(r.find((f) => f.id === 'f9')).toMatchObject({ mlRestante: 100, ativo: true })
    expect(r.find((f) => f.id === 'f1')).toMatchObject({ mlRestante: 0, ativo: false })
  })
  it('sem frasco ativo do perfume reativa o próprio', () => {
    expect(aplicarDevolucoes([f1], [{ frascoId: 'f1', ml: 4 }])[0]).toMatchObject({ mlRestante: 4, ativo: true })
  })
  it('item antigo sem decant: soma no próprio frasco, sem teto', () => {
    const cheio = { ...f9, mlRestante: 98 }
    expect(aplicarDevolucoes([cheio], [{ frascoId: 'f9', ml: 5, semTeto: true }])[0].mlRestante).toBe(103)
  })
  it('não altera a lista recebida', () => {
    aplicarDevolucoes([f1], [{ frascoId: 'f1', ml: 4 }])
    expect(f1.mlRestante).toBe(0)
  })
})
