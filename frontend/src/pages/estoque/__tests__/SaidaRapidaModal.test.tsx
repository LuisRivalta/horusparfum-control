import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'

const mockRpc = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: null, error: null })))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'pr1', nome: 'Perfume X', estoque_atual: 10 }],
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

describe('SaidaRapidaModal', () => {
  it('chama a RPC registrar_saida com o payload correto', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<SaidaRapidaModal open onClose={vi.fn()} onDone={onDone} />)

    await waitFor(() => expect(screen.getByLabelText(/produto/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto/i), 'pr1')
    await user.clear(screen.getByLabelText(/quantidade/i))
    await user.type(screen.getByLabelText(/quantidade/i), '2')
    await user.selectOptions(screen.getByLabelText(/motivo/i), 'venda')
    await user.click(screen.getByRole('button', { name: /^registrar$/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('registrar_saida', {
        p_produto_id: 'pr1',
        p_qtd: 2,
        p_motivo: 'venda',
        p_responsavel: 'teste@horus.com',
      })
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('exibe o erro da RPC (ex: estoque insuficiente)', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Estoque insuficiente: 10 unidades disponíveis' },
    } as never)

    render(<SaidaRapidaModal open onClose={vi.fn()} onDone={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto/i), 'pr1')
    await user.clear(screen.getByLabelText(/quantidade/i))
    await user.type(screen.getByLabelText(/quantidade/i), '99')
    await user.selectOptions(screen.getByLabelText(/motivo/i), 'venda')
    await user.click(screen.getByRole('button', { name: /^registrar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/estoque insuficiente/i)).toBeInTheDocument()
    })
  })
})
