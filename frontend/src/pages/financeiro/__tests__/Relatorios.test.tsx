import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FinRelatorios } from '../Relatorios'

const hoje = new Date()
const mesAtual = hoje.getMonth()
const anoAtual = hoje.getFullYear()
const dataAtual = (dia: number) => new Date(anoAtual, mesAtual, dia, 12).toISOString()
const dataMesAnterior = new Date(anoAtual, mesAtual - 1, 10, 12).toISOString()

const mockTransacoes = [
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
  {
    id: 't4',
    descricao: 'Venda antiga',
    tipo: 'entrada',
    valor: 999,
    categoria: 'Vendas',
    forma_pagamento: 'Pix',
    responsavel: 'Luis',
    origem: 'manual',
    created_at: dataMesAnterior,
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockTransacoes, error: null })),
      })),
    })),
  },
}))

describe('FinRelatorios', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza resumo financeiro e categorias do mês atual', async () => {
    render(<FinRelatorios />)

    await waitFor(() => expect(screen.getAllByText('Venda balcão').length).toBeGreaterThan(0))

    expect(screen.getByText('Relatórios financeiros')).toBeInTheDocument()
    expect(screen.getByText('Receitas por categoria')).toBeInTheDocument()
    expect(screen.getByText('Despesas por categoria')).toBeInTheDocument()
    expect(screen.getAllByText('Fornecedores').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Marketing').length).toBeGreaterThan(0)
    expect(screen.queryByText('Venda antiga')).not.toBeInTheDocument()
    expect(screen.getByText('3 no período')).toBeInTheDocument()
  })

  it('aciona impressão para exportar PDF', async () => {
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
