import { describe, it, expect } from 'vitest'
import { podeFrasco, calcularNovoML, statusAposDecant, resumoConsumo, type ConsumoDecant } from '../decants'

describe('podeFrasco', () => {
  it('retorna true quando tem estoque e nenhum frasco ativo', () => {
    expect(podeFrasco({ estoque_atual: 3 }, [])).toBe(true)
  })

  it('retorna false quando estoque é zero', () => {
    expect(podeFrasco({ estoque_atual: 0 }, [])).toBe(false)
  })

  it('retorna false quando já existe frasco ativo', () => {
    expect(podeFrasco({ estoque_atual: 2 }, [{ id: 'f1' }])).toBe(false)
  })
})

describe('calcularNovoML', () => {
  it('subtrai o decant do restante', () => {
    expect(calcularNovoML(100, 10)).toBe(90)
  })

  it('permite decant exato (resultado 0)', () => {
    expect(calcularNovoML(10, 10)).toBe(0)
  })

  it('retorna null quando decant excede o disponível', () => {
    expect(calcularNovoML(10, 11)).toBeNull()
  })

  it('retorna null quando decant é zero', () => {
    expect(calcularNovoML(100, 0)).toBeNull()
  })
})

describe('statusAposDecant', () => {
  it('retorna ativo quando ml restante > 0', () => {
    expect(statusAposDecant(10)).toBe('ativo')
  })

  it('retorna esgotado quando ml restante é 0', () => {
    expect(statusAposDecant(0)).toBe('esgotado')
  })
})

describe('resumoConsumo', () => {
  const ini = new Date('2026-06-01T00:00:00')
  const fim = new Date('2026-06-30T23:59:59')

  it('agrupa por classificação e soma o custo no período', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: 'perda', custo: 6.25, created_at: '2026-06-10T12:00:00Z' },
      { classificacao: 'brinde', custo: 8.25, created_at: '2026-06-12T12:00:00Z' },
      { classificacao: 'perda', custo: 3.75, created_at: '2026-06-15T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([
      { classificacao: 'perda', label: 'Perda', total: 10 },
      { classificacao: 'brinde', label: 'Brinde', total: 8.25 },
    ])
  })

  it('ignora itens fora do período', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: 'brinde', custo: 8.25, created_at: '2026-06-12T12:00:00Z' },
      { classificacao: 'brinde', custo: 100, created_at: '2026-05-30T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([{ classificacao: 'brinde', label: 'Brinde', total: 8.25 }])
  })

  it('classifica null como "Sem classificação"', () => {
    const dados: ConsumoDecant[] = [
      { classificacao: null, custo: 5, created_at: '2026-06-10T12:00:00Z' },
    ]
    const r = resumoConsumo(dados, ini, fim)
    expect(r).toEqual([{ classificacao: 'sem', label: 'Sem classificação', total: 5 }])
  })

  it('retorna lista vazia quando não há dados', () => {
    expect(resumoConsumo([], ini, fim)).toEqual([])
  })
})
