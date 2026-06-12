import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FinDashboard } from '../Dashboard'

// Mockar os gráficos: em jsdom o ResponsiveContainer não tem largura.
// O foco do teste são os cards e o seletor.
vi.mock('../dashboard/EvolucaoChart', () => ({
  EvolucaoChart: () => <div data-testid="evolucao-chart" />,
}))
vi.mock('../dashboard/CategoriaChart', () => ({
  CategoriaChart: () => <div data-testid="categoria-chart" />,
}))

const mockTransacoes = [
  { id: 't1', descricao: 'Venda', tipo: 'entrada', valor: 500, categoria: 'Vendas', created_at: '2026-06-10T12:00:00' },
  { id: 't2', descricao: 'Compra', tipo: 'saida', valor: 200, categoria: 'Fornecedores', created_at: '2026-06-12T12:00:00' },
  { id: 't3', descricao: 'Venda antiga', tipo: 'entrada', valor: 1000, categoria: 'Vendas', created_at: '2026-03-01T12:00:00' },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockTransacoes, error: null })),
    })),
  },
}))

describe('FinDashboard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra saldo histórico (entradas - saídas de tudo)', async () => {
    render(<FinDashboard />)
    // 500 + 1000 - 200 = 1300
    await waitFor(() => expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument())
  })

  it('mostra receita/despesa/lucro do mês corrente (junho)', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument()) // receita
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument() // despesa
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument() // lucro
  })

  it('renderiza os dois gráficos', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByTestId('evolucao-chart')).toBeInTheDocument())
    expect(screen.getByTestId('categoria-chart')).toBeInTheDocument()
  })

  it('trocar para o ano inteiro inclui a transação de março no lucro', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^ano$/i }))
    // ano: receita 1500, despesa 200, lucro 1300
    await waitFor(() => expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument())
  })
})
