import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConferenciaModal } from '../pedidos/ConferenciaModal'

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'i1', qtd_pedida: 5, preco_unitario: 100,
              produtos: { nome: 'Perfume X', foto_url: null },
            },
            {
              id: 'i2', qtd_pedida: 3, preco_unitario: 130,
              produtos: { nome: 'Perfume Y', foto_url: null },
            },
          ],
          error: null,
        })),
      })),
    })),
    rpc: mockRpc,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  vi.clearAllMocks()
})

const pedido = { id: 'p1', numero: 1 }

describe('ConferenciaModal', () => {
  it('lista os itens com qtd pedida e campo de qtd recebida pré-preenchido', async () => {
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    const inputs = screen.getAllByLabelText(/qtd recebida/i)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue(5)
    expect(inputs[1]).toHaveValue(3)
  })

  it('exibe seletor de divergência quando a qtd recebida difere', async () => {
    const user = userEvent.setup()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    expect(screen.queryByLabelText(/tipo de divergência/i)).not.toBeInTheDocument()

    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')

    expect(screen.getByLabelText(/tipo de divergência/i)).toBeInTheDocument()
  })

  it('chama a RPC confirmar_recebimento com o payload correto', async () => {
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={onConfirmed} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())

    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')
    await user.selectOptions(screen.getByLabelText(/tipo de divergência/i), 'faltou')
    await user.click(screen.getByRole('button', { name: /confirmar recebimento/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('confirmar_recebimento', {
        p_pedido_id: 'p1',
        p_itens: [
          { item_id: 'i1', qtd_recebida: 3, divergencia_tipo: 'faltou', divergencia_obs: null },
          { item_id: 'i2', qtd_recebida: 3, divergencia_tipo: null, divergencia_obs: null },
        ],
        p_recebido_por: 'teste@horus.com',
      })
    })
    expect(onConfirmed).toHaveBeenCalled()
  })

  it('bloqueia confirmação com qtd divergente sem tipo classificado', async () => {
    const user = userEvent.setup()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    const input = screen.getAllByLabelText(/qtd recebida/i)[0]
    await user.clear(input)
    await user.type(input, '3')
    await user.click(screen.getByRole('button', { name: /confirmar recebimento/i }))

    expect(mockRpc).not.toHaveBeenCalled()
    expect(screen.getByText(/exige tipo de divergência/i)).toBeInTheDocument()
  })

  it('não envia divergência fantasma quando a qtd volta ao valor pedido', async () => {
    const user = userEvent.setup()
    render(<ConferenciaModal pedido={pedido} onClose={vi.fn()} onConfirmed={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Perfume X')).toBeInTheDocument())
    const input = screen.getAllByLabelText(/qtd recebida/i)[0]

    // diverge, classifica, e depois volta ao valor original
    await user.clear(input)
    await user.type(input, '3')
    await user.selectOptions(screen.getByLabelText(/tipo de divergência/i), 'faltou')
    await user.clear(input)
    await user.type(input, '5')

    await user.click(screen.getByRole('button', { name: /confirmar recebimento/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('confirmar_recebimento', expect.objectContaining({
        p_itens: [
          { item_id: 'i1', qtd_recebida: 5, divergencia_tipo: null, divergencia_obs: null },
          { item_id: 'i2', qtd_recebida: 3, divergencia_tipo: null, divergencia_obs: null },
        ],
      }))
    })
  })
})
