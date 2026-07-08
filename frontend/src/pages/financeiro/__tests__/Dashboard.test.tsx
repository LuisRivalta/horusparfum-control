import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FinDashboard } from '../Dashboard'

// Mockar os gráficos: em jsdom o ResponsiveContainer não tem largura.
// O foco do teste são os cards e o seletor.
vi.mock('../dashboard/EvolucaoChart', () => ({
  EvolucaoChart: () => <div data-testid="evolucao-chart" />,
}))
vi.mock('../dashboard/CategoriaChart', () => ({
  CategoriaChart: () => <div data-testid="categoria-chart" />,
}))

const { mockSupabaseFrom } = vi.hoisted(() => {
  const mockTransacoes = [
    { id: 't1', descricao: 'Venda', tipo: 'entrada', valor: 500, categoria: 'Vendas', created_at: '2026-06-10T12:00:00' },
    { id: 't2', descricao: 'Compra', tipo: 'saida', valor: 200, categoria: 'Fornecedores', created_at: '2026-06-12T12:00:00' },
    { id: 't3', descricao: 'Venda antiga', tipo: 'entrada', valor: 1000, categoria: 'Vendas', created_at: '2026-03-01T12:00:00' },
  ]

  const mockVendas = [
    { data_venda: '2026-06-10', status: 'concluida', total_custo: 120 },
    { data_venda: '2026-06-11', status: 'cancelada', total_custo: 999 },
  ]

  const mockSupabaseFrom = vi.fn((table: string) => ({
    select: vi.fn(() => {
      if (table === 'transacoes') {
        return Promise.resolve({ data: mockTransacoes, error: null })
      }

      if (table === 'vendas') {
        return Promise.resolve({ data: mockVendas, error: null })
      }

      return Promise.resolve({ data: [], error: null })
    }),
  }))

  return { mockSupabaseFrom }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}))

describe('FinDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-20T12:00:00'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra saldo histórico (entradas - saídas de tudo)', async () => {
    render(<FinDashboard />)
    // 500 + 1000 - 200 = 1300
    await waitFor(() => expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument())
  })

  it('mostra receita/despesa/lucro do mês corrente (junho)', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument()) // receita
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument() // despesa
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument() // lucro com custo vendido
    expect(mockSupabaseFrom).toHaveBeenCalledWith('vendas')
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
