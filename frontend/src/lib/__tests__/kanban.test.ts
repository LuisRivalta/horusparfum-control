import { describe, it, expect } from 'vitest'
import { agrupar, ordemAoSoltar, situacaoPrazo, hojeLocal, COLUNAS, type Tarefa } from '../kanban'

const t = (over: Partial<Tarefa> = {}): Tarefa => ({
  id: 't1', titulo: 'Tarefa', descricao: null, prazo: null, status: 'a_fazer', ordem: 0, ...over,
})

describe('COLUNAS', () => {
  it('tem as três colunas na ordem', () => {
    expect(COLUNAS.map((c) => c.titulo)).toEqual(['A fazer', 'Fazendo', 'Feito'])
  })
})

describe('agrupar', () => {
  it('separa por status e ordena pela ordem', () => {
    const g = agrupar([t({ id: 'b', ordem: 2 }), t({ id: 'c', status: 'feito' }), t({ id: 'a', ordem: 1 })])
    expect(g.a_fazer.map((x) => x.id)).toEqual(['a', 'b'])
    expect(g.fazendo).toEqual([])
    expect(g.feito.map((x) => x.id)).toEqual(['c'])
  })
})

describe('ordemAoSoltar', () => {
  const col = [t({ id: 'a', ordem: 1 }), t({ id: 'b', ordem: 2 }), t({ id: 'c', ordem: 4 })]
  it('coluna vazia = 0', () => expect(ordemAoSoltar([], null, 'x')).toBe(0))
  it('no fim = última + 1', () => expect(ordemAoSoltar(col, null, 'x')).toBe(5))
  it('antes do primeiro = primeira - 1', () => expect(ordemAoSoltar(col, 'a', 'x')).toBe(0))
  it('no meio = média dos vizinhos', () => expect(ordemAoSoltar(col, 'c', 'x')).toBe(3))
  it('ignora a própria tarefa movida', () => {
    expect(ordemAoSoltar(col, 'c', 'b')).toBe(2.5) // vizinhos viram a (1) e c (4)
    expect(ordemAoSoltar(col, null, 'c')).toBe(3)   // fim sem ela: b (2) + 1
  })
  it('vizinhos com a mesma ordem não quebram', () => {
    expect(ordemAoSoltar([t({ id: 'a', ordem: 1 }), t({ id: 'b', ordem: 1 })], 'b', 'x')).toBe(1)
  })
})

describe('situacaoPrazo', () => {
  it('atrasado, hoje ou nada', () => {
    expect(situacaoPrazo(t({ prazo: '2026-11-24' }), '2026-11-25')).toBe('atrasado')
    expect(situacaoPrazo(t({ prazo: '2026-11-25' }), '2026-11-25')).toBe('hoje')
    expect(situacaoPrazo(t({ prazo: '2026-11-26' }), '2026-11-25')).toBeNull()
    expect(situacaoPrazo(t(), '2026-11-25')).toBeNull()
  })
  it('em Feito não tem destaque', () => {
    expect(situacaoPrazo(t({ prazo: '2026-11-01', status: 'feito' }), '2026-11-25')).toBeNull()
  })
})

describe('hojeLocal', () => {
  it('usa o dia local em aaaa-mm-dd', () => {
    expect(hojeLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
