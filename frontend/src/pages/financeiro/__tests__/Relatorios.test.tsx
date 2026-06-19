import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { FinRelatorios } from '../Relatorios'

const hoje = new Date()
const mesAtual = hoje.getMonth()
const anoAtual = hoje.getFullYear()
const dataAtual = (dia: number) => new Date(anoAtual, mesAtual, dia, 12).toISOString()

const mockRelatorio = {
  periodo: {
    inicio: new Date(anoAtual, mesAtual, 1).toISOString(),
    fim: new Date(anoAtual, mesAtual + 1, 0, 23, 59, 59, 999).toISOString(),
  },
  resumo: {
    receita: 500,
    despesa: 275,
    lucro: 225,
    saldo_historico: 1224,
  },
  categorias: {
    receitas: [{ categoria: 'Vendas', total: 500 }],
    despesas: [
      { categoria: 'Fornecedores', total: 200 },
      { categoria: 'Marketing', total: 75 },
    ],
  },
  origens: [
    { origem: 'Manual', qtd: 2 },
    { origem: 'Venda', qtd: 1 },
  ],
  maiores: {
    receitas: [
      {
        id: 't1',
        descricao: 'Venda balcão',
        tipo: 'entrada',
        valor: 500,
        categoria: 'Vendas',
        forma_pagamento: 'Pix',
        responsavel: 'Luis',
        origem: 'venda',
        created_at: dataAtual(10),
      },
    ],
    despesas: [
      {
        id: 't2',
        descricao: 'Compra fornecedor',
        tipo: 'saida',
        valor: 200,
        categoria: 'Fornecedores',
        forma_pagamento: 'Boleto',
        responsavel: 'Luis',
        origem: 'manual',
        created_at: dataAtual(12),
      },
      {
        id: 't3',
        descricao: 'Tráfego pago',
        tipo: 'saida',
        valor: 75,
        categoria: 'Marketing',
        forma_pagamento: 'Cartão',
        responsavel: 'Luis',
        origem: 'manual',
        created_at: dataAtual(13),
      },
    ],
  },
  transacoes: [
    {
      id: 't3',
      descricao: 'Tráfego pago',
      tipo: 'saida',
      valor: 75,
      categoria: 'Marketing',
      forma_pagamento: 'Cartão',
      responsavel: 'Luis',
      origem: 'manual',
      created_at: dataAtual(13),
    },
    {
      id: 't2',
      descricao: 'Compra fornecedor',
      tipo: 'saida',
      valor: 200,
      categoria: 'Fornecedores',
      forma_pagamento: 'Boleto',
      responsavel: 'Luis',
      origem: 'manual',
      created_at: dataAtual(12),
    },
    {
      id: 't1',
      descricao: 'Venda balcão',
      tipo: 'entrada',
      valor: 500,
      categoria: 'Vendas',
      forma_pagamento: 'Pix',
      responsavel: 'Luis',
      origem: 'venda',
      created_at: dataAtual(10),
    },
  ],
  total_lancamentos: 3,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'jwt-teste' } },
      })),
    },
  },
}))

describe('FinRelatorios', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockRelatorio),
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renderiza resumo financeiro calculado pelo backend', async () => {
    render(<FinRelatorios />)

    await waitFor(() => expect(screen.getAllByText('Venda balcão').length).toBeGreaterThan(0))

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/financeiro/relatorios?'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt-teste' },
      }),
    )
    expect(screen.getByText('Relatórios financeiros')).toBeInTheDocument()
    expect(screen.getByText('Receitas por categoria')).toBeInTheDocument()
    expect(screen.getByText('Despesas por categoria')).toBeInTheDocument()
    expect(screen.getAllByText('Fornecedores').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Marketing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Venda').length).toBeGreaterThan(0)
    expect(screen.getByText('3 no período')).toBeInTheDocument()
  })

  it('aciona impressão para exportar PDF com dados do backend', async () => {
    const print = vi.fn()
    const close = vi.fn()
    const focus = vi.fn()
    const write = vi.fn()
    const open = vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close },
      focus,
      print,
    } as unknown as Window)

    render(<FinRelatorios />)
    await waitFor(() => expect(screen.getAllByText('Venda balcão').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: /exportar pdf/i }))

    expect(open).toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Relatório financeiro'))
    expect(close).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
    expect(print).toHaveBeenCalled()
  })
})
