import { describe, it, expect } from 'vitest'
import { podeFrasco, calcularNovoML, statusAposDecant } from '../decants'

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
