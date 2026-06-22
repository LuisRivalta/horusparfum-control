import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductDetailsModal, type Produto } from '../ProductDetailsModal'

const { mockDeleteEq, mockRpc } = vi.hoisted(() => ({
  mockDeleteEq: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: mockDeleteEq,
      })),
    })),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'luis@example.com' } }),
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

  it('remove produto apenas do estoque quando aberto pela tela de estoque', async () => {
    const onUpdated = vi.fn()
    const onClose = vi.fn()
    mockRpc.mockResolvedValueOnce({ error: null })

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
        estoqueAction="removeFromStock"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /remover do estoque/i }))
    fireEvent.click(screen.getByRole('button', { name: /^remover$/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('registrar_saida', {
        p_produto_id: 'p1',
        p_qtd: 3,
        p_motivo: 'Removido do estoque',
        p_responsavel: 'luis@example.com',
      })
    })
    expect(mockDeleteEq).not.toHaveBeenCalled()
    expect(onUpdated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
