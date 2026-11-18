import { describe, expect, it } from 'vitest'
import { vendeDecant } from '../tipos'

const tipos = [
  { id: 't1', vende_decant: true },
  { id: 't2', vende_decant: false },
]

describe('vendeDecant', () => {
  it('true para tipo que vende em decant (Perfume)', () => {
    expect(vendeDecant({ tipo_id: 't1' }, tipos)).toBe(true)
  })
  it('false para tipo que não vende (Creme)', () => {
    expect(vendeDecant({ tipo_id: 't2' }, tipos)).toBe(false)
  })
  it('true para produto sem tipo, para não esconder perfume antigo', () => {
    expect(vendeDecant({ tipo_id: null }, tipos)).toBe(true)
  })
})
