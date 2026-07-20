import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditarVendaModal } from '../EditarVendaModal'

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' } }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from, rpc },
}))

const venda = {
  id: 'v1',
  numero: 18,
  canal_id: 'c1',
  data_venda: '2026-07-13',
  forma_pagamento: 'Pix',
  cliente: 'Cliente teste',
  taxa_total: 10,
  frete: 5,
  responsavel: 'operador@horus.com',
  observacao: 'Entregar no horario comercial',
}

const itens = [
  {
    id: 'vi-produto',
    tipo: 'produto',
    produto_id: 'p1',
    frasco_id: null,
    ml: null,
    quantidade: 2,
    preco_unitario: 150,
    custo_embalagem: 0,
  },
  {
    id: 'vi-decant',
    tipo: 'decant',
    produto_id: 'p1',
    frasco_id: 'f1',
    ml: 5,
    quantidade: 1,
    preco_unitario: 25,
    custo_embalagem: 2,
  },
]

function queryFor(table: string) {
  let frascoQuery: 'ativos' | 'referenciados' | null = null
  const dataFor = () => {
    if (table === 'canais') return [{ id: 'c1', nome: 'Shopee', taxa_padrao: 12 }]
    if (table === 'produtos') return [{ id: 'p1', nome: 'Perfume X', estoque_atual: 2, custo_medio: 100, preco_referencia: 180 }]
    if (table === 'embalagens_decant') return [{ tamanho_ml: 5, custo: 2 }]
    if (table === 'vendas') return venda
    if (table === 'venda_itens') return itens
    if (table === 'frascos_abertos' && frascoQuery === 'referenciados') {
      return [{ id: 'f1', produto_id: 'p1', ml_restante: 0, ml_total: 100, produtos: { nome: 'Perfume X', custo_medio: 100 } }]
    }
    return []
  }
  const response = () => ({ data: dataFor(), error: null })
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: string) => {
      if (table === 'frascos_abertos' && column === 'status' && value === 'ativo') frascoQuery = 'ativos'
      return query
    }),
    in: vi.fn((column: string) => {
      if (table === 'frascos_abertos' && column === 'id') frascoQuery = 'referenciados'
      return query
    }),
    order: vi.fn(() => Promise.resolve(response())),
    single: vi.fn(() => Promise.resolve(response())),
    then: (onfulfilled: (value: ReturnType<typeof response>) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve(response()).then(onfulfilled, onrejected),
  }
  return query
}

beforeEach(() => {
  from.mockImplementation(queryFor)
  rpc.mockResolvedValue({ error: null })
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('EditarVendaModal', () => {
  it('preenche a venda existente e envia editar_venda ao salvar', async () => {
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
    expect(screen.getByLabelText(/^Produto$/)).toHaveValue('p1')
    expect(screen.getByLabelText('Frasco aberto')).toHaveValue('f1')

    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Cartao' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alteracoes/i }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      'editar_venda',
      expect.objectContaining({ p_venda_id: 'v1', p_forma_pagamento: 'Cartao' }),
    ))
  })

  it('mantem o formulario aberto e mostra o erro da rpc', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'Estoque insuficiente' } })
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /salvar alteracoes/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /salvar alteracoes/i }))

    expect(await screen.findByText('Estoque insuficiente')).toBeInTheDocument()
    expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix')
  })
})

