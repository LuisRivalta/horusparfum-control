import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AConfirmar } from '../AConfirmar'

type Row = Record<string, unknown>

const { from, rpc, conferir, db, updates } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  conferir: vi.fn(),
  db: {} as Record<string, Record<string, unknown>[]>,
  updates: [] as { table: string; patch: Row; id: unknown }[],
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' } }),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { from, rpc } }))
vi.mock('@/lib/apiShopify', () => ({ apiShopify: { conferir } }))

const LISTADOS = ['aguardando_pagamento', 'a_confirmar', 'cancelado_pos_confirmacao']

function queryFor(table: string) {
  const filtros: ((r: Row) => boolean)[] = []
  const rows = () => (db[table] ?? []).filter((r) => filtros.every((f) => f(r)))
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((c: string, v: unknown) => { filtros.push((r) => r[c] === v); return query }),
    in: vi.fn((c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return query }),
    or: vi.fn(() => { filtros.push((r) => LISTADOS.includes(r.status as string) || r.alerta != null); return query }),
    order: vi.fn(() => query),
    update: vi.fn((patch: Row) => ({
      eq: (_c: string, id: unknown) => { updates.push({ table, patch, id }); return Promise.resolve({ error: null }) },
    })),
    single: vi.fn(() => Promise.resolve({ data: rows()[0] ?? null, error: null })),
    then: (ok: (v: { data: Row[]; error: null }) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(ok, ko),
  }
  return query
}

const pedido = (id: string, numero: string, status: string, extra: Row = {}) => ({
  id, canal: 'shopify', externo_id: `gid-${id}`, numero, status, cliente: null,
  criado_em: '2026-11-17T15:00:00-03:00', total: 100, frete: 0, itens: [], venda_id: null, alerta: null, ...extra,
})

beforeEach(() => {
  rpc.mockReset()
  conferir.mockReset()
  conferir.mockResolvedValue({ novos: 0 })
  updates.length = 0
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, {
    canais: [
      { id: 'c1', nome: 'Shopee', taxa_padrao: 12, usa_envio: false, ativo: true },
      { id: 'c3', nome: 'Shopify', taxa_padrao: 5, usa_envio: false, ativo: true },
    ],
    produtos: [
      { id: 'p1', nome: 'Perfume X', estoque_atual: 2, custo_medio: 100, preco_referencia: 180, volume_ml: 100 },
      { id: 'p2', nome: 'Perfume Y', estoque_atual: 0, custo_medio: 200, preco_referencia: 300, volume_ml: 50 },
    ],
    frascos_abertos: [
      { id: 'f2', produto_id: 'p2', ml_restante: 30, ml_total: 50, status: 'ativo', produtos: { nome: 'Perfume Y', custo_medio: 200 } },
    ],
    insumos: [],
    insumo_listas: [],
    tipos_produto: [],
    pedidos_canal: [
      pedido('ped1', '#1001', 'aguardando_pagamento'),
      pedido('ped2', '#1002', 'a_confirmar', {
        cliente: 'Ana', frete: 19.9, total: 259.9,
        itens: [
          { variante_id: 'v1', titulo: 'Perfume X 100ml', quantidade: 1, preco_unitario: 180, produto_id: 'p1', tipo: 'frasco', ml: null },
          { variante_id: 'v2', titulo: 'Perfume Y 5ml', quantidade: 2, preco_unitario: 30, produto_id: 'p2', tipo: 'decant', ml: 5 },
        ],
      }),
      pedido('ped3', '#1003', 'cancelado_pos_confirmacao', { alerta: 'Cancelado na Shopify — desfazer venda?', venda_id: 'v9' }),
      pedido('ped4', '#1004', 'confirmado', { alerta: 'Reembolso parcial de R$ 10,00 na Shopify', venda_id: 'v8' }),
      pedido('ped5', '#1005', 'confirmado', { venda_id: 'v7' }),
    ],
  })
  from.mockImplementation(queryFor)
  rpc.mockResolvedValue({ error: null })
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const linha = (numero: string) => screen.getByText(numero).closest('tr') as HTMLElement

async function abrir() {
  render(<AConfirmar />)
  await waitFor(() => expect(screen.getByText('#1002')).toBeInTheDocument())
}

async function abrirFormulario() {
  await abrir()
  fireEvent.click(within(linha('#1002')).getByRole('button', { name: 'Confirmar' }))
  await waitFor(() => expect(screen.getByLabelText('Nome da venda (opcional)')).toHaveValue('Shopify #1002'))
}

describe('AConfirmar', () => {
  it('confere a Shopify uma vez e lista só os pedidos pendentes ou com alerta', async () => {
    await abrir()
    expect(conferir).toHaveBeenCalledTimes(1)
    for (const n of ['#1001', '#1002', '#1003', '#1004']) expect(screen.getByText(n)).toBeInTheDocument()
    expect(screen.queryByText('#1005')).not.toBeInTheDocument()
  })

  it('aguardando pagamento não pode ser confirmado', async () => {
    await abrir()
    const l = linha('#1001')
    expect(within(l).getByText('Aguardando pagamento')).toBeInTheDocument()
    expect(within(l).getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })

  it('falha do conferir mostra aviso e lista o que está no banco', async () => {
    conferir.mockRejectedValue(new Error('sem conexão'))
    await abrir()
    expect(screen.getByText(/não foi possível conferir a shopify/i)).toBeInTheDocument()
    expect(screen.getByText('#1001')).toBeInTheDocument()
  })

  it('Confirmar abre o formulário com as linhas do pedido, frete 0 e taxa do canal', async () => {
    await abrirFormulario()
    expect(screen.getByLabelText('Cliente (opcional)')).toHaveValue('Ana')
    expect(screen.getByLabelText('Data da venda')).toHaveValue('2026-11-17')
    expect(screen.getByLabelText('Frete absorvido (R$)')).toHaveValue(0)
    expect(screen.getByText(/cliente pagou r\$\s*19,90 de frete/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Taxa do pedido (R$)')).toHaveValue(12)
    expect(screen.getAllByLabelText('Preço un.').map((e) => (e as HTMLInputElement).value)).toEqual(['180', '30'])

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('confirmar_pedido_canal', expect.anything()))
    const args = rpc.mock.calls.find((c) => c[0] === 'confirmar_pedido_canal')![1]
    expect(args).toMatchObject({
      p_pedido_id: 'ped2', p_canal_id: 'c3', p_data_venda: '2026-11-17', p_cliente: 'Ana',
      p_frete: 0, p_taxa_total: 12, p_titulo: 'Shopify #1002',
    })
    expect(args.p_itens).toEqual([
      expect.objectContaining({ tipo: 'produto', produto_id: 'p1', quantidade: 1, preco_unitario: 180 }),
      expect.objectContaining({ tipo: 'decant', produto_id: 'p2', frasco_id: 'f2', ml: 5, quantidade: 2, preco_unitario: 30,
        origens: [{ frasco_id: 'f2', ml: 10 }] }),
    ])
    expect(rpc.mock.calls.some((c) => c[0] === 'registrar_venda')).toBe(false)
  })

  it('item sem produto ligado pede o produto e não salva', async () => {
    const ped2 = db.pedidos_canal.find((p) => p.id === 'ped2')!
    ped2.itens = [{ variante_id: 'v3', titulo: 'Kit', quantidade: 1, preco_unitario: 50, produto_id: null, tipo: null, ml: null }]
    await abrirFormulario()
    expect(screen.getByText('Escolha o produto (não ligado na Shopify)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(screen.getByText(/linhas incompletas|item válido/i)).toBeInTheDocument())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sem canal Shopify mostra erro e não salva', async () => {
    db.canais = db.canais.filter((c) => c.nome !== 'Shopify')
    await abrir()
    fireEvent.click(within(linha('#1002')).getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.getByText(/canal "Shopify"/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('cancelado após confirmação: Desfazer venda e Manter', async () => {
    await abrir()
    fireEvent.click(within(linha('#1003')).getByRole('button', { name: 'Desfazer venda' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('desfazer_pedido_canal', { p_pedido_id: 'ped3' }))

    fireEvent.click(within(linha('#1003')).getByRole('button', { name: 'Manter' }))
    await waitFor(() => expect(updates).toContainEqual({ table: 'pedidos_canal', patch: { status: 'confirmado', alerta: null }, id: 'ped3' }))
  })

  it('alerta de reembolso parcial tem Ok que limpa o alerta', async () => {
    await abrir()
    const l = linha('#1004')
    expect(within(l).getByText('Reembolso parcial de R$ 10,00 na Shopify')).toBeInTheDocument()
    fireEvent.click(within(l).getByRole('button', { name: 'Ok' }))
    await waitFor(() => expect(updates).toContainEqual({ table: 'pedidos_canal', patch: { alerta: null }, id: 'ped4' }))
  })
})
