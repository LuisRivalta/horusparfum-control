import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VendasDashboard } from '../vendas/VendasDashboard'

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="vendas-chart">{children}</div>
    ),
    LineChart: Container,
    Line: () => <div data-testid="chart-line" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'jwt-vendas' } },
      })),
    },
  },
}))

const dashboardMock = {
  periodo: { inicio: '2026-06-01T00:00:00', fim: '2026-06-30T23:59:59' },
  resumo: {
    qtd_vendas: 1,
    itens_vendidos: 3,
    faturamento_bruto: 3500,
    total_custo: 2200,
    lucro_bruto: 1300,
    margem_media: 37.14,
    roi_medio: 72.22,
    ticket_medio: 3500,
  },
  evolucao: [
    { periodo: '2026-06-01', label: 'Jun', faturamento_bruto: 3500, lucro_bruto: 1300 },
  ],
  produtos: [
    {
      produto_id: 'p1',
      nome: 'Asad Lattafa',
      quantidade: 3,
      faturamento_bruto: 3500,
      lucro_bruto: 1300,
      margem: 37.14,
      roi: 72.22,
    },
  ],
  canais: [
    {
      canal_id: 'c1',
      nome: 'Shopee',
      qtd_vendas: 1,
      faturamento_bruto: 3500,
      lucro_bruto: 1300,
      margem: 37.14,
      roi: 72.22,
    },
  ],
  vendas: [
    {
      id: 'v1',
      numero: 10,
      data_venda: '2026-06-15',
      canal: 'Shopee',
      itens: 3,
      faturamento_bruto: 3500,
      total_custo: 2200,
      lucro_bruto: 1300,
      margem: 37.14,
      roi: 72.22,
    },
  ],
}

const dashboardVazio = {
  periodo: { inicio: '2026-06-01T00:00:00', fim: '2026-06-30T23:59:59' },
  resumo: {
    qtd_vendas: 0,
    itens_vendidos: 0,
    faturamento_bruto: 0,
    total_custo: 0,
    lucro_bruto: 0,
    margem_media: 0,
    roi_medio: null,
    ticket_medio: 0,
  },
  evolucao: [],
  produtos: [],
  canais: [],
  vendas: [],
}

describe('VendasDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 15, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('busca o dashboard no backend autenticado e renderiza indicadores, rankings, tabela e grafico', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(dashboardMock),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<VendasDashboard />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/estoque/vendas/dashboard?')
    expect(url).toContain('inicio=2026-06-01T00%3A00%3A00')
    expect(url).toContain('fim=2026-06-30T23%3A59%3A59')
    expect(options).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-vendas' }),
    }))

    await waitFor(() => expect(screen.getByText('Asad Lattafa')).toBeInTheDocument())
    expect(screen.getByText('Faturamento bruto')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 3.500,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 1.300,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Margem media')).toBeInTheDocument()
    expect(screen.getAllByText('37,14%').length).toBeGreaterThan(0)
    expect(screen.getByText('ROI medio')).toBeInTheDocument()
    expect(screen.getAllByText('72,22%').length).toBeGreaterThan(0)
    expect(screen.getByText('Ticket medio')).toBeInTheDocument()
    expect(screen.getByText('Volume')).toBeInTheDocument()
    expect(screen.getByText('Itens')).toBeInTheDocument()
    expect(screen.getAllByText('Shopee').length).toBeGreaterThan(0)
    expect(screen.getByText('#10')).toBeInTheDocument()
    expect(screen.getByTestId('vendas-chart')).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha vendas concluidas no periodo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(dashboardVazio),
    })))

    render(<VendasDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Nenhuma venda concluida no periodo')).toBeInTheDocument()
    })
  })

  it('exibe detalhe retornado pela API quando o backend falha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: 'Falha calculada pelo backend' }),
    })))

    render(<VendasDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Falha calculada pelo backend')).toBeInTheDocument()
    })
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
  })

  it('aborta a requisicao anterior e limpa dados antigos ao trocar periodo', async () => {
    const pendingResponse = new Promise(() => {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(dashboardMock),
      })
      .mockReturnValueOnce(pendingResponse)
    vi.stubGlobal('fetch', fetchMock)

    render(<VendasDashboard />)

    await waitFor(() => expect(screen.getByText('3 itens vendidos')).toBeInTheDocument())

    const firstOptions = fetchMock.mock.calls[0][1] as RequestInit
    fireEvent.change(screen.getByDisplayValue('Junho'), { target: { value: '6' } })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const secondUrl = String(fetchMock.mock.calls[1][0])

    expect((firstOptions.signal as AbortSignal).aborted).toBe(true)
    expect(secondUrl).toContain('inicio=2026-07-01T00%3A00%3A00')
    expect(secondUrl).toContain('fim=2026-07-31T23%3A59%3A59')
    expect(screen.queryByText('3 itens vendidos')).not.toBeInTheDocument()
    expect(screen.getByText('Carregando')).toBeInTheDocument()
  })
})
