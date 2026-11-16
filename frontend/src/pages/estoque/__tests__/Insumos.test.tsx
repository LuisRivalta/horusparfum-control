import { opcoes } from '@/test/escolher'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { EstInsumos } from '../Insumos'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
}))

const tabelas: Record<string, unknown[]> = {}
const chamadas: { tabela: string; op: string; args: unknown[] }[] = []
const rpc = vi.fn(() => Promise.resolve({ data: {}, error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => (rpc as (...x: unknown[]) => unknown)(...a),
    from: (tabela: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'eq', 'delete', 'update', 'insert', 'upsert', 'in']) {
        b[op] = (...args: unknown[]) => { chamadas.push({ tabela, op, args }); return b }
      }
      b.then = (res: (v: unknown) => unknown) => res({ data: tabelas[tabela] ?? [], error: null })
      return b
    },
  },
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  chamadas.length = 0
  rpc.mockClear()
  tabelas.insumos = [
    { id: 'i1', nome: 'Caixa', unidade: 'un', estoque_atual: 40, estoque_minimo: 10, custo_medio: 0.1488, ativo: true },
    { id: 'i2', nome: 'Etiqueta', unidade: 'un', estoque_atual: 2, estoque_minimo: 10, custo_medio: 0.5, ativo: true },
    { id: 'i3', nome: 'Fita Velha', unidade: 'un', estoque_atual: 0, estoque_minimo: 0, custo_medio: 0, ativo: false },
  ]
  tabelas.insumo_movimentacoes = []
  tabelas.insumo_lista_itens = []
  tabelas.insumo_listas = [
    { id: 'l1', tipo: 'decant', tamanho_ml: 5, peso_g: null, altura_cm: null, largura_cm: null, comprimento_cm: null, insumo_lista_itens: [] },
    { id: 'l2', tipo: 'envio_decant', tamanho_ml: null, peso_g: null, altura_cm: null, largura_cm: null, comprimento_cm: null, insumo_lista_itens: [] },
  ]
})

async function abrirCompra() {
  render(<EstInsumos />)
  fireEvent.click(await screen.findByLabelText('Comprar Caixa'))
}

describe('EstInsumos', () => {
  it('pré-preenche "quantos sobraram" com o estoque do sistema', async () => {
    await abrirCompra()
    expect(screen.getByLabelText('Quantos sobraram?')).toHaveValue(40)
  })

  it('estoque negativo no sistema pré-preenche "quantos sobraram" com 0', async () => {
    tabelas.insumos[0] = { ...(tabelas.insumos[0] as object), estoque_atual: -3 }
    await abrirCompra()
    expect(screen.getByLabelText('Quantos sobraram?')).toHaveValue(0)
    fireEvent.change(screen.getByLabelText('Quantidade comprada'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('registrar_compra_insumo', expect.objectContaining({ p_saldo_contado: 0 })))
  })

  it('mostra perda na prévia quando o contado é menor', async () => {
    await abrirCompra()
    fireEvent.change(screen.getByLabelText('Quantidade comprada'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Quantos sobraram?'), { target: { value: '5' } })
    expect(screen.getByText(/35 serão lançados como perda/)).toBeInTheDocument()
  })

  it('confirma a compra chamando registrar_compra_insumo', async () => {
    await abrirCompra()
    fireEvent.change(screen.getByLabelText('Quantidade comprada'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Valor total (R$)'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Pix' } })
    fireEvent.change(screen.getByLabelText('Quantos sobraram?'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Confirmar compra'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('registrar_compra_insumo', {
      p_insumo_id: 'i1', p_qtd: 200, p_valor_total: 30, p_saldo_contado: 5,
      p_forma_pagamento: 'Pix', p_responsavel: 'test@example.com',
    }))
  })

  it('destaca insumo abaixo do mínimo', async () => {
    render(<EstInsumos />)
    expect(await screen.findByTestId('estoque-i2')).toHaveClass('text-down')
    expect(screen.getByTestId('estoque-i1')).not.toHaveClass('text-down')
  })

  it('lista de envio mostra campos de peso e medidas e salva', async () => {
    render(<EstInsumos />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Kits por venda' }))
    const secao = await screen.findByTestId('lista-l2')
    fireEvent.change(within(secao).getByLabelText('Peso (g)'), { target: { value: '300' } })
    fireEvent.change(within(secao).getByLabelText('Altura (cm)'), { target: { value: '10' } })
    expect(within(secao).getByLabelText('Largura (cm)')).toBeInTheDocument()
    expect(within(secao).getByLabelText('Comprimento (cm)')).toBeInTheDocument()
    fireEvent.click(within(secao).getByText('Salvar medidas'))
    await waitFor(() => {
      const upd = chamadas.find((c) => c.tabela === 'insumo_listas' && c.op === 'update')
      expect(upd?.args[0]).toMatchObject({ peso_g: 300, altura_cm: 10 })
    })
  })

  it('insumo inativo na lista aparece como (inativo) e fica fora do custo', async () => {
    tabelas.insumo_listas[0] = { ...(tabelas.insumo_listas[0] as object), insumo_lista_itens: [
      { insumo_id: 'i2', quantidade: 1 }, { insumo_id: 'i3', quantidade: 1 },
    ] }
    tabelas.insumos[2] = { ...(tabelas.insumos[2] as object), custo_medio: 10 }
    render(<EstInsumos />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Kits por venda' }))
    const secao = await screen.findByTestId('lista-l1')
    expect(within(secao).getByText(/\(inativo\)/).parentElement).toHaveTextContent('Fita Velha')
    expect(within(secao).getByText(/Etiqueta/)).not.toHaveTextContent('inativo')
    expect(within(secao).getByText(/^Custo/)).toHaveTextContent(/0,50$/) // só a Etiqueta; a inativa custaria 10
  })

  it('insumo inativo não aparece para adicionar nas listas', async () => {
    render(<EstInsumos />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Kits por venda' }))
    const secao = await screen.findByTestId('lista-l1')
    const lista = opcoes(within(secao).getByRole('combobox'))
    expect(lista).toContain('Caixa')
    expect(lista).not.toContain('Fita Velha')
  })
})
