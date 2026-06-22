import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductDetailsModal, type Produto } from '../ProductDetailsModal'

const mockDeleteEq = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: mockDeleteEq,
      })),
    })),
  },
}))

const produto: Produto = {
  id: 'p1',
  nome: 'Asad',
  volume_ml: 100,
  preco_referencia: 120,
  categoria_id: 'c1',
  fornecedor_id: 'f1',
  estoque_atual: 3,
  estoque_minimo: 1,
  foto_url: null,
  created_at: '2026-06-22T00:00:00Z',
  categorias: { nome: 'Masculino' },
  fornecedores: { nome: 'Cairo' },
}

describe('ProductDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.open = false
    })
  })

  it('mostra erro quando o banco bloqueia a exclusao do produto', async () => {
    mockDeleteEq.mockResolvedValueOnce({
      error: {
        message: 'update or delete on table "produtos" violates foreign key constraint',
      },
    })

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^excluir$/i })[1])

    await waitFor(() => {
      expect(screen.getByText(/nao foi possivel excluir/i)).toBeInTheDocument()
    })
  })
})
