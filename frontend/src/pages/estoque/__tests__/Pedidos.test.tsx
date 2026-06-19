import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import { EstPedidos, type PedidoRow } from '../Pedidos'

// Stub do layout-pai (PedidosLayout): expõe um actionSlot via Outlet context,
// como o layout real faz. O botão "Novo pedido" é portado para esse slot.
function LayoutStub() {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setSlot} />
      <Outlet context={{ actionSlot: slot }} />
    </>
  )
}

function renderComLayout() {
  return render(
    <MemoryRouter initialEntries={['/estoque/pedidos']}>
      <Routes>
        <Route path="/estoque/pedidos" element={<LayoutStub />}>
          <Route index element={<EstPedidos />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

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
})

// Mock encadeável do supabase: from().select().order() → resolve com dados
const mockPedidos: PedidoRow[] = [
  {
    id: 'p1', numero: 1, status: 'aguardando', valor_total: 890,
    previsao_chegada: '2026-06-11', responsavel: 'Luis',
    created_at: '2026-06-10T12:00:00Z',
    fornecedor_id: 'f1',
    fornecedores: { nome: 'Essências Cairo' },
    pedido_itens: [{ id: 'i1' }, { id: 'i2' }],
  },
  {
    id: 'p2', numero: 2, status: 'recebido', valor_total: 300,
    previsao_chegada: null, responsavel: 'Ana',
    created_at: '2026-06-09T12:00:00Z',
    fornecedor_id: 'f2',
    fornecedores: { nome: 'Aromas SP' },
    pedido_itens: [{ id: 'i3' }],
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'pedidos' ? mockPedidos : [],
          error: null,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

describe('EstPedidos (lista)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza os pedidos com fornecedor, total e status', async () => {
    render(<MemoryRouter><EstPedidos /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('Essências Cairo')).toBeInTheDocument()
    })
    expect(screen.getByText('Aromas SP')).toBeInTheDocument()
    expect(screen.getByText('R$ 890,00')).toBeInTheDocument()
    expect(screen.getByText('Aguardando')).toBeInTheDocument()
    expect(screen.getByText('Recebido')).toBeInTheDocument()
  })

  it('renderiza o botão "Novo pedido" no slot de ação do layout', async () => {
    renderComLayout()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /novo pedido/i })).toBeInTheDocument()
    )
  })

  it('exibe modal de confirmação ao clicar em Cancelar e chama update ao confirmar', async () => {
    const { supabase } = await import('@/lib/supabase')
    const updateSpy = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }))
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'pedidos' ? mockPedidos : [],
          error: null,
        })),
      })),
      update: updateSpy,
    }))

    render(<MemoryRouter><EstPedidos /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Essências Cairo')).toBeInTheDocument())

    // clicar no botão Cancelar da linha aguardando
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))

    // modal de confirmação deve aparecer
    await waitFor(() => {
      expect(screen.getByText(/cancelar o pedido/i)).toBeInTheDocument()
    })

    // confirmar cancelamento
    fireEvent.click(screen.getByText('Cancelar pedido', { selector: 'button' }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ status: 'cancelado' })
    })
  })

  it('exibe botão Editar apenas para pedidos aguardando', async () => {
    render(<MemoryRouter><EstPedidos /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText('Essências Cairo')).toBeInTheDocument()
    })

    // pedido aguardando (p1) deve ter o botão Editar
    expect(screen.getByRole('button', { name: /^editar$/i })).toBeInTheDocument()

    // pedido recebido (p2) não deve ter botão Editar
    // (só há um botão Editar — o de p1)
    expect(screen.getAllByRole('button', { name: /^editar$/i })).toHaveLength(1)
  })
})
