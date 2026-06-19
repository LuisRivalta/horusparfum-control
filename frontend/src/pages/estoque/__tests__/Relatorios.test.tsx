import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstRelatorios } from '../Relatorios'

function makeResult(data: unknown) {
  const promise = Promise.resolve({ data, error: null })
  return Object.assign(promise, { gte: () => promise, eq: () => promise })
}

const mockProdutos = [
  { id: 'p1', nome: 'Karnak', estoque_atual: 5, custo_medio: 100 },
  { id: 'p2', nome: 'Imagination', estoque_atual: 3, custo_medio: 50 },
]

const mockMovimentacoes = [
  { produto_id: 'p1', tipo: 'saida', quantidade: 10 },
]

const mockFrascos = [
  { id: 'f1', produto_id: 'p1', ml_restante: 40, status: 'ativo', produtos: { nome: 'Karnak' } },
]

const mockDecants = [
  { frasco_id: 'f1', ml: 10 },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => makeResult(
        table === 'produtos' ? mockProdutos :
        table === 'movimentacoes' ? mockMovimentacoes :
        table === 'frascos_abertos' ? mockFrascos :
        table === 'decants' ? mockDecants :
        []
      )),
    })),
  },
}))

describe('EstRelatorios', () => {
  it('renderiza a tabela de giro com os produtos após carregar', async () => {
    render(<EstRelatorios />)

    await waitFor(() => expect(screen.getAllByText('Karnak').length).toBeGreaterThan(0))

    expect(screen.getByText('Imagination')).toBeInTheDocument()
  })

  it('marca Parado para produto com estoque e zero saída', async () => {
    render(<EstRelatorios />)

    await waitFor(() => expect(screen.getByText('Imagination')).toBeInTheDocument())

    expect(screen.getAllByText(/parado/i).length).toBeGreaterThan(0)
  })

  it('preset de período padrão é 90 dias e clicar em 30 troca o ativo', async () => {
    render(<EstRelatorios />)

    const btn90 = screen.getByRole('button', { name: '90 dias' })
    const btn30 = screen.getByRole('button', { name: '30 dias' })

    expect(btn90).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn30)

    await waitFor(() => expect(btn30).toHaveAttribute('aria-pressed', 'true'))
    expect(btn90).toHaveAttribute('aria-pressed', 'false')
  })

  it('renderiza a seção de decants com o frasco aberto', async () => {
    render(<EstRelatorios />)

    await waitFor(() => expect(screen.getByText('Decants')).toBeInTheDocument())

    expect(screen.getAllByText('Karnak').length).toBeGreaterThan(0)
  })
})
