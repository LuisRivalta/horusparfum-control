import { describe, it, expect } from 'vitest'
import {
  periodoMes,
  periodoTrimestre,
  periodoAno,
  periodoPersonalizado,
  calcularSaldoHistorico,
  resumoPeriodo,
  agruparPorCategoria,
  evolucaoMensal,
  type Transacao,
} from '../financeiro'

describe('periodoMes', () => {
  it('cria início e fim do mês (mes 0-11) com bordas de dia inteiras', () => {
    const p = periodoMes(2026, 5) // junho
    expect(p.inicio).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999))
    expect(p.label).toBe('Junho 2026')
  })
})

describe('periodoTrimestre', () => {
  it('cria início e fim do trimestre (1-4)', () => {
    const p = periodoTrimestre(2026, 2) // abr-jun
    expect(p.inicio).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999))
    expect(p.label).toBe('2º trimestre 2026')
  })
})

describe('periodoAno', () => {
  it('cria o ano inteiro', () => {
    const p = periodoAno(2026)
    expect(p.inicio).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999))
    expect(p.label).toBe('2026')
  })
})

describe('periodoPersonalizado', () => {
  it('normaliza início para 00:00 e fim para 23:59:59.999', () => {
    const p = periodoPersonalizado(new Date(2026, 5, 1, 14, 30), new Date(2026, 5, 15, 9, 0))
    expect(p.inicio).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0))
    expect(p.fim).toEqual(new Date(2026, 5, 15, 23, 59, 59, 999))
    expect(p.label).toBe('01/06/2026 – 15/06/2026')
  })
})

function tx(over: Partial<Transacao>): Transacao {
  return {
    id: 'x', descricao: '', tipo: 'entrada', valor: 0,
    categoria: null, created_at: '2026-06-10T12:00:00',
    ...over,
  }
}

describe('calcularSaldoHistorico', () => {
  it('soma entradas menos saídas de tudo', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 100 }),
      tx({ tipo: 'entrada', valor: 50 }),
      tx({ tipo: 'saida', valor: 30 }),
    ]
    expect(calcularSaldoHistorico(t)).toBe(120)
  })

  it('lista vazia retorna 0', () => {
    expect(calcularSaldoHistorico([])).toBe(0)
  })
})

describe('resumoPeriodo', () => {
  const periodo = periodoMes(2026, 5) // junho

  it('soma receita e despesa dentro do período e calcula lucro', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 200, created_at: '2026-06-10T12:00:00' }),
      tx({ tipo: 'saida', valor: 80, created_at: '2026-06-20T12:00:00' }),
      tx({ tipo: 'entrada', valor: 999, created_at: '2026-05-31T12:00:00' }), // fora
    ]
    expect(resumoPeriodo(t, periodo)).toEqual({ receita: 200, despesa: 80, lucro: 120 })
  })

  it('inclui transações no primeiro e no último instante do período', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 10, created_at: '2026-06-01T00:00:00' }),
      tx({ tipo: 'entrada', valor: 5, created_at: '2026-06-30T23:59:59' }),
    ]
    expect(resumoPeriodo(t, periodo).receita).toBe(15)
  })
})

describe('agruparPorCategoria', () => {
  const periodo = periodoMes(2026, 5)

  it('agrupa por categoria e ordena desc', () => {
    const t = [
      tx({ tipo: 'saida', valor: 30, categoria: 'Marketing' }),
      tx({ tipo: 'saida', valor: 100, categoria: 'Fornecedores' }),
      tx({ tipo: 'saida', valor: 20, categoria: 'Marketing' }),
    ]
    expect(agruparPorCategoria(t, periodo, 'saida')).toEqual([
      { categoria: 'Fornecedores', total: 100 },
      { categoria: 'Marketing', total: 50 },
    ])
  })

  it('categoria nula vira "Sem categoria"', () => {
    const t = [tx({ tipo: 'saida', valor: 10, categoria: null })]
    expect(agruparPorCategoria(t, periodo, 'saida')).toEqual([
      { categoria: 'Sem categoria', total: 10 },
    ])
  })
})

describe('evolucaoMensal', () => {
  it('retorna nMeses pontos terminando no mês de referência, zerando meses sem dados', () => {
    const t = [
      tx({ tipo: 'entrada', valor: 100, created_at: '2026-06-10T12:00:00' }),
      tx({ tipo: 'saida', valor: 40, created_at: '2026-06-12T12:00:00' }),
      tx({ tipo: 'entrada', valor: 70, created_at: '2026-04-05T12:00:00' }),
    ]
    const r = evolucaoMensal(t, new Date(2026, 5, 15), 6) // jan..jun
    expect(r).toHaveLength(6)
    expect(r[0]).toEqual({ mes: 'jan', receita: 0, despesa: 0 })
    expect(r[3]).toEqual({ mes: 'abr', receita: 70, despesa: 0 })
    expect(r[5]).toEqual({ mes: 'jun', receita: 100, despesa: 40 })
  })
})
