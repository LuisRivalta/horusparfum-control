import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NovaVendaModal } from '../vendas/NovaVendaModal'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' } }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: table === 'canais'
              ? [{ id: 'c1', nome: 'Shopee', taxa_padrao: 12 }]
              : [],
            error: null,
          })),
        })),
        order: vi.fn(() => Promise.resolve({
          data: table === 'produtos'
            ? [{ id: 'p1', nome: 'Perfume X', estoque_atual: 2, custo_medio: 100, preco_referencia: 180 }]
            : [],
          error: null,
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ error: null })),
  },
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('NovaVendaModal', () => {
  it('usa grids responsivos no formulario e nos itens', async () => {
    render(<NovaVendaModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/canal/i)).toBeInTheDocument())

    const canalGrid = screen.getByLabelText(/canal/i).closest('.grid')
    const produtoGrid = screen.getByLabelText(/^produto$/i).closest('.grid')

    expect(canalGrid).toHaveClass('grid-cols-1')
    expect(canalGrid).toHaveClass('sm:grid-cols-2')
    expect(produtoGrid).toHaveClass('grid-cols-1')
    expect(produtoGrid).toHaveClass('sm:grid-cols-[1fr_70px_110px]')
  })
})
