import { describe, expect, it } from 'vitest'
import { casarItemImportado, normalizarNomeProduto } from '../pedidoPdfImport'

const produtos = [
  { id: 'p1', nome: 'Lattafa Asad Bourbon EDP 100ml' },
  { id: 'p2', nome: 'Al Rasasi Hawas Black EDP 100ML' },
  { id: 'p3', nome: 'Perfume Duplicado' },
  { id: 'p4', nome: 'Perfume-Duplicado' },
]

describe('pedidoPdfImport', () => {
  it('normaliza nome ignorando acento, pontuacao e caixa', () => {
    expect(normalizarNomeProduto('  Perfúme   Teste - 100ML ')).toBe('perfume teste 100ml')
  })

  it('casa item importado por nome normalizado', () => {
    const result = casarItemImportado(
      { nome: 'LATTAFA ASAD BOURBON EDP 100ML', qtd: 4, preco_unitario: 169.99 },
      produtos,
    )

    expect(result.produto_id).toBe('p1')
    expect(result.importado_nome).toBe('LATTAFA ASAD BOURBON EDP 100ML')
    expect(result.qtd).toBe('4')
    expect(result.preco).toBe('169.99')
    expect(result.matchStatus).toBe('matched')
  })

  it('deixa pendente quando nao encontra produto', () => {
    const result = casarItemImportado(
      { nome: 'PRODUTO NOVO 200ML', qtd: 1, preco_unitario: 99.9 },
      produtos,
    )

    expect(result.produto_id).toBe('')
    expect(result.matchStatus).toBe('unmatched')
  })

  it('deixa pendente quando encontra match ambiguo', () => {
    const result = casarItemImportado(
      { nome: 'Perfume Duplicado', qtd: 1, preco_unitario: 50 },
      produtos,
    )

    expect(result.produto_id).toBe('')
    expect(result.matchStatus).toBe('ambiguous')
  })
})
