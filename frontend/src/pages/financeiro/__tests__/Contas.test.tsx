import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FinContas, dividirParcelas, somarMeses } from '../Contas'

const { mockRpc, mockContas, setContas } = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] }
  return {
    mockRpc: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    mockContas: state,
    setContas: (rows: unknown[]) => { state.rows = rows },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: mockContas.rows, error: null }),
        }),
      }),
    }),
    rpc: mockRpc,
  },
}))

/** Venda de R$ 500: entrada de 300 já recebida + 2x de 100 (a 2ª vencida). */
const CONTA_PARCELADA = {
  id: 'c1',
  tipo: 'receber',
  entidade: 'João Silva',
  descricao: 'Pedido perfumes',
  valor: 500,
  vencimento: '2026-09-08',
  status: 'a_vencer',
  valor_entrada: 300,
  num_parcelas: 2,
  created_at: '2026-09-08T12:00:00',
  conta_parcelas: [
    { id: 'p1', numero: 0, valor: 300, vencimento: '2026-09-08', status: 'recebida', quitada_em: '2026-09-08' },
    { id: 'p2', numero: 1, valor: 100, vencimento: '2026-10-08', status: 'a_vencer', quitada_em: null },
    { id: 'p3', numero: 2, valor: 100, vencimento: '2026-09-01', status: 'a_vencer', quitada_em: null },
  ],
}

describe('dividirParcelas', () => {
  it('divide igualmente quando não há resto', () => {
    expect(dividirParcelas(30000, 3)).toEqual([10000, 10000, 10000])
  })

  it('joga o resto do arredondamento na última parcela', () => {
    // R$ 100,00 em 3x -> 33,33 + 33,33 + 33,34
    expect(dividirParcelas(10000, 3)).toEqual([3333, 3333, 3334])
  })

  it('preserva o total exato independente do número de parcelas', () => {
    for (const n of [1, 2, 3, 6, 7, 12, 13]) {
      const partes = dividirParcelas(50000, n)
      expect(partes).toHaveLength(n)
      expect(partes.reduce((a, b) => a + b, 0)).toBe(50000)
    }
  })

  it('retorna vazio para entradas inválidas', () => {
    expect(dividirParcelas(1000, 0)).toEqual([])
    expect(dividirParcelas(0, 3)).toEqual([])
  })
})

describe('somarMeses', () => {
  it('avança meses mantendo o dia', () => {
    expect(somarMeses('2026-09-08', 1)).toBe('2026-10-08')
    expect(somarMeses('2026-09-08', 4)).toBe('2027-01-08')
  })

  it('encaixa no último dia quando o mês é mais curto', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('sem deslocamento devolve a mesma data', () => {
    expect(somarMeses('2026-09-08', 0)).toBe('2026-09-08')
  })
})

describe('FinContas', () => {
  beforeEach(() => {
    // jsdom não implementa <dialog>
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-11T12:00:00'))
    vi.clearAllMocks()
    mockRpc.mockImplementation(() => Promise.resolve({ data: {}, error: null }))
    setContas([CONTA_PARCELADA])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('agrupa a conta mostrando total, saldo e progresso', async () => {
    render(<FinContas tipo="receber" />)

    await waitFor(() => expect(screen.getByText('Pedido perfumes')).toBeInTheDocument())
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    // 300 quitados de 500 -> saldo 200, 1 de 3 parcelas quitada
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('entrada R$ 300,00')).toBeInTheDocument()
    expect(screen.getByText('2x')).toBeInTheDocument()
  })

  it('lista as parcelas ao expandir, marcando vencida pela data', async () => {
    render(<FinContas tipo="receber" />)
    await waitFor(() => expect(screen.getByText('Pedido perfumes')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Pedido perfumes'))

    expect(await screen.findByText('Entrada')).toBeInTheDocument()
    expect(screen.getByText('Parcela 1/2')).toBeInTheDocument()
    expect(screen.getByText('Parcela 2/2')).toBeInTheDocument()
    // p3 vence 01/09 e hoje é 11/09 -> derivada como vencida, mesmo com status a_vencer
    expect(screen.getByText('Vencida')).toBeInTheDocument()
    expect(screen.getByText('A vencer')).toBeInTheDocument()
  })

  it('baixa a parcela chamando baixar_parcela com a data informada', async () => {
    render(<FinContas tipo="receber" />)
    await waitFor(() => expect(screen.getByText('Pedido perfumes')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Pedido perfumes'))

    const botoes = await screen.findAllByRole('button', { name: /Receber/ })
    fireEvent.click(botoes[0])

    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('baixar_parcela', expect.objectContaining({
      p_parcela_id: 'p2',
      p_data: '2026-09-11',
    })))
  })

  it('estorna uma parcela quitada', async () => {
    render(<FinContas tipo="receber" />)
    await waitFor(() => expect(screen.getByText('Pedido perfumes')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Pedido perfumes'))

    fireEvent.click(await screen.findByRole('button', { name: /Estornar/ }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('estornar_parcela', { p_parcela_id: 'p1' }))
  })

  it('cria conta com entrada e parcelas via RPC criar_conta', async () => {
    setContas([])
    render(<FinContas tipo="receber" />)
    await waitFor(() => expect(screen.getByText('Nenhuma conta cadastrada')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Nova conta/ }))

    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Valor da entrada (R$)'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Nº de parcelas'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('1º vencimento'), { target: { value: '2026-10-08' } })

    // A prévia deve mostrar entrada + 2 parcelas de 100
    expect(await screen.findByText('Prévia — 3 lançamentos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('criar_conta', expect.objectContaining({
      p_tipo: 'receber',
      p_valor_total: 500,
      p_entrada: 300,
      p_num_parcelas: 2,
      p_primeiro_vencimento: '2026-10-08',
      p_entrada_quitada: true,
      p_intervalo_meses: 1,
    })))
  })

  it('bloqueia o envio quando a entrada excede o valor total', async () => {
    setContas([])
    render(<FinContas tipo="receber" />)
    await waitFor(() => expect(screen.getByText('Nenhuma conta cadastrada')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Nova conta/ }))
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Valor da entrada (R$)'), { target: { value: '300' } })

    expect(await screen.findByText('A entrada não pode ser maior que o valor total.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('usa o vocabulário de contas a pagar quando tipo=pagar', async () => {
    setContas([{ ...CONTA_PARCELADA, tipo: 'pagar' }])
    render(<FinContas tipo="pagar" />)

    await waitFor(() => expect(screen.getByText('Contas a pagar')).toBeInTheDocument())
    expect(screen.getByRole('columnheader', { name: 'Fornecedor' })).toBeInTheDocument()
    expect(screen.getByText('Pagas')).toBeInTheDocument()
  })
})
