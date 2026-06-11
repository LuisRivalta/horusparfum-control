import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovoPedidoModal } from '../pedidos/NovoPedidoModal'

const inserts: Record<string, unknown[]> = { pedidos: [], pedido_itens: [], produtos: [] }

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
      insert: vi.fn((payload: unknown) => {
        inserts[table]?.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 'novo-id' }, error: null })),
          })),
        }
      }),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
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
  beforeEach(() => {
    vi.clearAllMocks()
    inserts.pedidos.length = 0
    inserts.pedido_itens.length = 0
    inserts.produtos.length = 0
  })

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

  it('submete pedido e itens com payload correto', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoPedidoModal open onClose={vi.fn()} onCreated={onCreated} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(inserts.pedidos[0]).toMatchObject({
      fornecedor_id: 'f1',
      valor_total: 500,
      responsavel: 'teste@horus.com',
    })
    expect(inserts.pedido_itens[0]).toEqual([
      { pedido_id: 'novo-id', produto_id: 'pr1', qtd_pedida: 5, preco_unitario: 100 },
    ])
  })
})
