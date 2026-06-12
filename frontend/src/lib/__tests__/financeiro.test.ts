import { describe, it, expect } from 'vitest'
import {
  periodoMes,
  periodoTrimestre,
  periodoAno,
  periodoPersonalizado,
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
