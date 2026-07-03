import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EstVendas, type VendaRow } from '../Vendas'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

vi.mock('@/components/shared/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../vendas/VendasDashboard', () => ({
  VendasDashboard: () => <div>Dashboard analitico de vendas</div>,
}))

const mockVendas: VendaRow[] = [
  {
    id: 'v1', numero: 1, status: 'concluida', data_venda: '2026-06-16',
    total_bruto: 240, total_custo: 132, lucro_bruto: 78,
    canal_id: 'c1', canais: { nome: 'Shopee' },
    venda_itens: [{ id: 'it1' }, { id: 'it2' }],
  },
  {
    id: 'v2', numero: 2, status: 'cancelada', data_venda: '2026-06-15',
    total_bruto: 100, total_custo: 60, lucro_bruto: 40,
    canal_id: 'c2', canais: { nome: 'Loja física' },
    venda_itens: [{ id: 'it3' }],
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockVendas, error: null })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

describe('EstVendas (lista)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza as vendas com canal, lucro e status', async () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Shopee')).toBeInTheDocument())
    expect(screen.getByText('Loja física')).toBeInTheDocument()
    expect(screen.getByText('R$ 78,00')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
  })

  it('renderiza o botão "Nova venda"', () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /nova venda/i })).toBeInTheDocument()
  })


  it('mantem a lista em um container rolavel no mobile', async () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Shopee')).toBeInTheDocument())

    const table = screen.getAllByRole('table')[0]
    expect(table.parentElement).toHaveClass('overflow-x-auto')
    expect(table).toHaveClass('min-w-[760px]')
  })
  it('alterna entre lista e dashboard sem sair da tela de vendas', async () => {
    render(<MemoryRouter><EstVendas /></MemoryRouter>)

    expect(screen.getByRole('button', { name: /^lista$/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^dashboard$/i }))

    expect(screen.getByText('Dashboard analitico de vendas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dashboard$/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
