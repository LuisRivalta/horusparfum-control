import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstDivergencias } from '../Divergencias'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'd1', tipo: 'faltou', qtd_pedida: 5, qtd_recebida: 3,
              observacao: 'caixa violada', created_at: '2026-06-10T12:00:00Z',
              pedidos: { numero: 1 },
              fornecedores: { nome: 'Essências Cairo' },
              pedido_itens: { produtos: { nome: 'Perfume X' } },
            },
          ],
          error: null,
        })),
      })),
    })),
  },
}))

describe('EstDivergencias', () => {
  it('renderiza o log com fornecedor, produto, tipo e quantidades', async () => {
    render(<EstDivergencias />)

    await waitFor(() => expect(screen.getAllByText('Essências Cairo').length).toBeGreaterThan(0))
    expect(screen.getByText('Perfume X')).toBeInTheDocument()
    expect(screen.getAllByText('Faltou').length).toBeGreaterThan(0)
    expect(screen.getByText('5 → 3')).toBeInTheDocument()
    expect(screen.getByText('caixa violada')).toBeInTheDocument()
  })
})
