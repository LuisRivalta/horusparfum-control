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

const { mockSupabaseFrom, mockSelectByTable, mockVendasRange } = vi.hoisted(() => {
  const mockTransacoes = [
    { id: 't1', descricao: 'Venda', tipo: 'entrada', valor: 500, categoria: 'Vendas', created_at: '2026-06-10T12:00:00' },
    { id: 't2', descricao: 'Compra', tipo: 'saida', valor: 200, categoria: 'Fornecedores', created_at: '2026-06-12T12:00:00' },
    { id: 't3', descricao: 'Venda antiga', tipo: 'entrada', valor: 1000, categoria: 'Vendas', created_at: '2026-03-01T12:00:00' },
  ]

  const mockVendas = [
    { id: 'v1', data_venda: '2026-06-10', status: 'concluida', total_custo: 120 },
    { id: 'v2', data_venda: '2026-06-11', status: 'cancelada', total_custo: 999 },
  ]

  const mockSelectByTable = {
    transacoes: vi.fn((_query?: string) => Promise.resolve({ data: mockTransacoes, error: null })),
    vendas: vi.fn((_query?: string) => Promise.resolve({ data: mockVendas, error: null })),
  }
  const mockVendasRange = vi.fn((_from: number, _to: number) =>
    Promise.resolve({ data: mockVendas, error: null })
  )

  const mockSupabaseFrom = vi.fn((table: string) => ({
    select: vi.fn((query?: string) => {
      const handler = mockSelectByTable[table as keyof typeof mockSelectByTable]
      if (!handler) {
        return Promise.resolve({ data: [], error: null })
      }

      const result = handler(query)
      return table === 'vendas' ? Object.assign(result, { range: mockVendasRange }) : result
    }),
  }))

  return { mockSupabaseFrom, mockSelectByTable, mockVendasRange }
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
    mockSelectByTable.transacoes.mockImplementation(() => Promise.resolve({
      data: [
        { id: 't1', descricao: 'Venda', tipo: 'entrada', valor: 500, categoria: 'Vendas', created_at: '2026-06-10T12:00:00' },
        { id: 't2', descricao: 'Compra', tipo: 'saida', valor: 200, categoria: 'Fornecedores', created_at: '2026-06-12T12:00:00' },
        { id: 't3', descricao: 'Venda antiga', tipo: 'entrada', valor: 1000, categoria: 'Vendas', created_at: '2026-03-01T12:00:00' },
      ],
      error: null,
    }))
    mockSelectByTable.vendas.mockImplementation(() => Promise.resolve({
      data: [
        { id: 'v1', data_venda: '2026-06-10', status: 'concluida', total_custo: 120 },
        { id: 'v2', data_venda: '2026-06-11', status: 'cancelada', total_custo: 999 },
      ],
      error: null,
    }))
    mockVendasRange.mockImplementation(() => Promise.resolve({
      data: [
        { id: 'v1', data_venda: '2026-06-10', status: 'concluida', total_custo: 120 },
        { id: 'v2', data_venda: '2026-06-11', status: 'cancelada', total_custo: 999 },
      ],
      error: null,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra saldo histórico (entradas - saídas de tudo)', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument())
  })

  it('mostra receita/despesa/lucro do mês corrente (junho)', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 500,00')).toBeInTheDocument())
    expect(screen.getByText('R$ 200,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument()
    expect(mockSupabaseFrom).toHaveBeenCalledWith('vendas')
  })

  it('renderiza os dois gráficos', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByTestId('evolucao-chart')).toBeInTheDocument())
    expect(screen.getByTestId('categoria-chart')).toBeInTheDocument()
  })

  it('trocar para o ano inteiro desconta custo das vendas concluidas do lucro', async () => {
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('R$ 180,00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^ano$/i }))
    await waitFor(() => expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument())
    expect(screen.getByText('R$ 1.180,00')).toBeInTheDocument()
  })

  it('pagina todas as vendas em lotes de 1000', async () => {
    const primeiraPagina = Array.from({ length: 1000 }, (_, index) => ({
      id: 'v' + index,
      data_venda: '2026-06-10',
      status: 'cancelada',
      total_custo: 0,
    }))
    const ultimaVenda = {
      id: 'v1000',
      data_venda: '2026-06-10',
      status: 'concluida',
      total_custo: 25,
    }
    mockVendasRange
      .mockResolvedValueOnce({ data: primeiraPagina, error: null })
      .mockResolvedValueOnce({ data: [ultimaVenda], error: null })

    render(<FinDashboard />)

    await waitFor(() => expect(mockVendasRange).toHaveBeenCalledTimes(2))
    expect(screen.getByText('R$ 275,00')).toBeInTheDocument()
    expect(mockVendasRange).toHaveBeenNthCalledWith(1, 0, 999)
    expect(mockVendasRange).toHaveBeenNthCalledWith(2, 1000, 1999)
  })

  it('encerra loading e mostra erro quando uma consulta rejeita de verdade', async () => {
    mockVendasRange.mockImplementation(() => Promise.reject(new Error('falha de rede')))
    render(<FinDashboard />)
    await waitFor(() => expect(screen.getByText('Erro ao carregar dados financeiros: falha de rede')).toBeInTheDocument())
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})
