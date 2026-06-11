import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovoPedidoModal } from '../pedidos/NovoPedidoModal'

const mockInsert = vi.fn(() => ({
  select: vi.fn(() => ({
    single: vi.fn(() => Promise.resolve({ data: { id: 'novo-id' }, error: null })),
  })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'fornecedores'
            ? [{ id: 'f1', nome: 'Essências Cairo' }]
            : table === 'produtos'
              ? [{ id: 'pr1', nome: 'Perfume X' }, { id: 'pr2', nome: 'Perfume Y' }]
              : [],
          error: null,
        })),
      })),
      insert: mockInsert,
    })),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('NovoPedidoModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calcula o total ao vivo conforme itens são preenchidos', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/total do pedido/i)).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')

    expect(screen.getByText('R$ 500,00')).toBeInTheDocument()
  })

  it('bloqueia produto repetido em duas linhas', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.click(screen.getByRole('button', { name: /adicionar item/i }))
    await user.selectOptions(screen.getByLabelText(/produto 2/i), 'pr1')

    expect(screen.getByText(/produto repetido/i)).toBeInTheDocument()
  })
})
