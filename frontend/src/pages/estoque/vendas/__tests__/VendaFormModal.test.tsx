import { escolher, opcoes } from '@/test/escolher'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditarVendaModal } from '../EditarVendaModal'
import { NovaVendaModal } from '../NovaVendaModal'

type Row = Record<string, unknown>

const { from, rpc, db } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  db: {} as Record<string, Record<string, unknown>[]>,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' } }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from, rpc },
}))

// filtra as linhas da tabela pelos eq/in encadeados
function queryFor(table: string) {
  const filtros: ((r: Row) => boolean)[] = []
  const rows = () => (db[table] ?? []).filter((r) => filtros.every((f) => f(r)))
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((c: string, v: unknown) => { filtros.push((r) => r[c] === v); return query }),
    in: vi.fn((c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return query }),
    order: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: rows()[0] ?? null, error: null })),
    then: (ok: (v: { data: Row[]; error: null }) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(ok, ko),
  }
  return query
}

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

beforeEach(() => {
  rpc.mockReset()
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, {
    canais: [
      { id: 'c1', nome: 'Shopee', taxa_padrao: 12, usa_envio: true, ativo: true },
      { id: 'c2', nome: 'Loja física', taxa_padrao: 0, usa_envio: false, ativo: true },
    ],
    produtos: [
      { id: 'p1', nome: 'Perfume X', estoque_atual: 2, custo_medio: 100, preco_referencia: 180, volume_ml: 100 },
      { id: 'p2', nome: 'Perfume Y', estoque_atual: 0, custo_medio: 200, preco_referencia: 300, volume_ml: 50 },
    ],
    frascos_abertos: [
      { id: 'f1', produto_id: 'p1', ml_restante: 4, ml_total: 100, status: 'ativo', produtos: { nome: 'Perfume X', custo_medio: 100 } },
      { id: 'f2', produto_id: 'p2', ml_restante: 30, ml_total: 50, status: 'ativo', produtos: { nome: 'Perfume Y', custo_medio: 200 } },
    ],
    insumos: [
      { id: 'i-borrif', nome: 'Borrifador 2,5', custo_medio: 1, ativo: true },
      { id: 'i-caixa', nome: 'Caixinha', custo_medio: 3, ativo: true },
      { id: 'i-etiq', nome: 'Etiqueta', custo_medio: 0.2, ativo: true },
      { id: 'i-frasco10', nome: 'Frasco 10 ml', custo_medio: 2, ativo: true },
      { id: 'i-bolha', nome: 'Plástico bolha', custo_medio: 0.5, ativo: true },
    ],
    insumo_listas: [
      { id: 'l1', tipo: 'decant', tamanho_ml: 2.5, insumo_lista_itens: [{ insumo_id: 'i-borrif', quantidade: 1 }] },
      { id: 'l2', tipo: 'decant', tamanho_ml: 5, insumo_lista_itens: [] },
      { id: 'l3', tipo: 'decant', tamanho_ml: 10, insumo_lista_itens: [{ insumo_id: 'i-frasco10', quantidade: 1 }, { insumo_id: 'i-etiq', quantidade: 1 }] },
      { id: 'l4', tipo: 'frasco', tamanho_ml: null, insumo_lista_itens: [{ insumo_id: 'i-etiq', quantidade: 1 }] },
      { id: 'l5', tipo: 'envio_decant', tamanho_ml: null, insumo_lista_itens: [{ insumo_id: 'i-caixa', quantidade: 1 }, { insumo_id: 'i-bolha', quantidade: 1 }] },
      { id: 'l6', tipo: 'envio_frasco', tamanho_ml: null, insumo_lista_itens: [{ insumo_id: 'i-caixa', quantidade: 1 }] },
    ],
    vendas: [venda],
    venda_itens: [
      { id: 'vi-produto', venda_id: 'v1', tipo: 'produto', produto_id: 'p1', frasco_id: null, decant_id: null, ml: null, quantidade: 2, preco_unitario: 150, custo_embalagem: 0 },
      { id: 'vi-decant', venda_id: 'v1', tipo: 'decant', produto_id: 'p1', frasco_id: 'f1', decant_id: null, ml: 5, quantidade: 1, preco_unitario: 25, custo_embalagem: 2 },
    ],
    decant_origens: [],
    insumo_movimentacoes: [],
  })
  from.mockImplementation(queryFor)
  rpc.mockResolvedValue({ error: null })
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

async function novoDecant(ml: string, canal = 'c1') {
  render(<NovaVendaModal open onClose={vi.fn()} onSaved={vi.fn()} />)
  await waitFor(() => expect(opcoes(screen.getByLabelText('Canal'))).toHaveLength(3))
  escolher(screen.getByLabelText('Canal'), canal)
  escolher(screen.getByLabelText('Tipo'), 'decant')
  escolher(screen.getByLabelText('Frasco aberto'), 'f1')
  escolher(screen.getByLabelText('ml'), ml)
  fireEvent.change(screen.getByLabelText('Preço un.'), { target: { value: '50' } })
}

function payload(fn: string) {
  const call = rpc.mock.calls.find((c) => c[0] === fn)
  return call?.[1]
}

describe('VendaFormModal', () => {
  it('preenche a venda existente e envia editar_venda ao salvar', async () => {
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
    expect(screen.getByLabelText(/^Produto$/)).toHaveValue('p1')
    expect(screen.getByLabelText('Frasco aberto')).toHaveValue('f1')

    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Cartao' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      'editar_venda',
      expect.objectContaining({ p_venda_id: 'v1', p_forma_pagamento: 'Cartao' }),
    ))
  })

  it('mantem o formulario aberto e mostra o erro da rpc', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'editar_venda') {
        return Promise.resolve({ error: { message: 'Estoque insuficiente' } })
      }
      return Promise.resolve({ error: null })
    })
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))

    expect(await screen.findByText('Estoque insuficiente')).toBeInTheDocument()
    expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix')
  })

  it('decant de 2,5 ml aparece como opção', async () => {
    await novoDecant('2.5')
    expect(opcoes(screen.getByLabelText('ml'))).toContain('2,5 ml')
    expect(screen.getByLabelText('ml')).toHaveAttribute('value', '2.5')
    expect(screen.getByText('do frasco aberto')).toBeInTheDocument()
  })

  it('frasco com 4 ml e decant de 10 ml mostra "abrir 1 lacrado" e envia duas origens', async () => {
    await novoDecant('10')
    expect(screen.getByText('4 ml do aberto + abrir 1 lacrado (6 ml)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    const item = payload('registrar_venda').p_itens[0]
    expect(item.origens).toEqual([{ frasco_id: 'f1', ml: 4 }, { abrir_produto_id: 'p1', ml: 6 }])
    expect(item).not.toHaveProperty('custo_unitario')
  })

  it('sem lacrado oferece completar com outro perfume e só salva com o total certo', async () => {
    db.produtos[0].estoque_atual = 0
    await novoDecant('10')
    expect(screen.getByText(/faltam 6 ml/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    expect(await screen.findByText(/origens do decant/i)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /completar com outro perfume/i }))
    const outro = screen.getByLabelText('Outro perfume')
    expect(opcoes(outro).join()).not.toMatch(/Perfume X/)
    escolher(outro, 'f2')
    expect(screen.getByText('4 ml do aberto + 6 ml de Perfume Y')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    expect(payload('registrar_venda').p_itens[0].origens).toEqual([{ frasco_id: 'f1', ml: 4 }, { frasco_id: 'f2', ml: 6 }])
  })

  it('dois decants do mesmo frasco: o segundo só tira do aberto o que o primeiro deixou', async () => {
    db.frascos_abertos[0].ml_restante = 7
    await novoDecant('5')
    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }))
    escolher(screen.getAllByLabelText('Tipo')[1], 'decant')
    escolher(screen.getAllByLabelText('Frasco aberto')[1], 'f1')
    escolher(screen.getAllByLabelText('ml')[1], '2.5')
    fireEvent.change(screen.getAllByLabelText('Preço un.')[1], { target: { value: '30' } })
    expect(screen.getByText('2 ml do aberto + abrir 1 lacrado (0,5 ml)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    const [a, b] = payload('registrar_venda').p_itens
    expect(a.origens).toEqual([{ frasco_id: 'f1', ml: 5 }])
    expect(b.origens).toEqual([{ frasco_id: 'f1', ml: 2 }, { abrir_produto_id: 'p1', ml: 0.5 }])
  })

  it('lacrados vendidos como produto na mesma venda não são abertos pelo decant', async () => {
    db.produtos[0].estoque_atual = 1
    await novoDecant('10')
    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }))
    escolher(screen.getAllByLabelText(/^Produto$/)[0], 'p1')
    expect(screen.getByText(/faltam 6 ml/i)).toBeInTheDocument()
  })

  it('insumo inativo da lista não é pré-preenchido', async () => {
    db.insumos[3].ativo = false // Frasco 10 ml
    await novoDecant('10')
    expect(screen.queryByLabelText('Item 1: Frasco 10 ml')).toBeNull()
    expect(screen.getByLabelText('Item 1: Etiqueta')).toHaveValue(1)
  })

  it('erro do Postgres com "function" na mensagem não cai no fallback sem transação', async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === 'editar_venda'
      ? { error: { message: 'function _consumir_origens: ml insuficiente', code: 'P0001' } }
      : { error: null }))
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))
    expect(await screen.findByText(/ml insuficiente/)).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith('cancelar_venda', expect.anything())
  })

  it('origem gravada de frasco apagado: edição só de preço mantém o decant', async () => {
    db.venda_itens = [
      { id: 'vi-decant', venda_id: 'v1', tipo: 'decant', produto_id: 'p1', frasco_id: 'f1', decant_id: 'd1', ml: 5, quantidade: 1, preco_unitario: 50, custo_unitario: 5, custo_embalagem: 0 },
    ]
    db.decant_origens = [
      { decant_id: 'd1', frasco_id: null, produto_id: 'p1', ml: 3, abriu_frasco: false },
      { decant_id: 'd1', frasco_id: 'f1', produto_id: 'p1', ml: 2, abriu_frasco: false },
    ]
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('Preço un.')).toHaveValue(50))
    fireEvent.change(screen.getByLabelText('Preço un.'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))
    await waitFor(() => expect(payload('editar_venda')).toBeDefined())
    expect(payload('editar_venda').p_itens[0]).toMatchObject({ decant_id: 'd1', origens: [{ frasco_id: null, ml: 3 }, { frasco_id: 'f1', ml: 2 }] })
  })

  it('pré-preenche insumos com a lista do item e a de envio do canal', async () => {
    await novoDecant('10')
    expect(screen.getByLabelText('Item 1: Frasco 10 ml')).toHaveValue(1)
    expect(screen.getByLabelText('Item 1: Etiqueta')).toHaveValue(1)
    expect(screen.getByLabelText('Envio: Caixinha')).toHaveValue(1)
    expect(screen.getByLabelText('Envio: Plástico bolha')).toHaveValue(1)
    expect(screen.getByText('Custo dos insumos')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    const p = payload('registrar_venda')
    expect(p.p_itens[0].insumos).toEqual([{ insumo_id: 'i-frasco10', quantidade: 1 }, { insumo_id: 'i-etiq', quantidade: 1 }])
    expect(p.p_insumos_envio).toEqual([{ insumo_id: 'i-caixa', quantidade: 1 }, { insumo_id: 'i-bolha', quantidade: 1 }])
  })

  it('canal sem envio não traz kit de envio', async () => {
    await novoDecant('10', 'c2')
    expect(screen.queryByLabelText('Envio: Caixinha')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    expect(payload('registrar_venda').p_insumos_envio).toEqual([])
  })

  it('insumo editado vai no payload', async () => {
    await novoDecant('10')
    fireEvent.change(screen.getByLabelText('Envio: Caixinha'), { target: { value: '2' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover Etiqueta' })[0])

    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    const p = payload('registrar_venda')
    expect(p.p_insumos_envio).toContainEqual({ insumo_id: 'i-caixa', quantidade: 2 })
    expect(p.p_itens[0].insumos).toEqual([{ insumo_id: 'i-frasco10', quantidade: 1 }])
  })

  it('edição de venda carrega origens e insumos gravados', async () => {
    db.venda_itens = [
      { id: 'vi-produto', venda_id: 'v1', tipo: 'produto', produto_id: 'p1', frasco_id: null, decant_id: null, ml: null, quantidade: 2, preco_unitario: 150, custo_unitario: 100, custo_embalagem: 0.2 },
      { id: 'vi-decant', venda_id: 'v1', tipo: 'decant', produto_id: 'p1', frasco_id: 'f1', decant_id: 'd1', ml: 10, quantidade: 1, preco_unitario: 50, custo_unitario: 10, custo_embalagem: 2 },
    ]
    db.decant_origens = [
      { decant_id: 'd1', frasco_id: 'f1', produto_id: 'p1', ml: 4, abriu_frasco: false },
      { decant_id: 'd1', frasco_id: 'f9', produto_id: 'p1', ml: 6, abriu_frasco: true },
    ]
    db.insumo_movimentacoes = [
      { venda_id: 'v1', decant_id: 'd1', insumo_id: 'i-frasco10', quantidade: -1, tipo: 'consumo' },
      { venda_id: 'v1', decant_id: null, insumo_id: 'i-etiq', quantidade: -1, tipo: 'consumo' },
      { venda_id: 'v1', decant_id: null, insumo_id: 'i-caixa', quantidade: -2, tipo: 'consumo' },
    ]
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
    expect(screen.getByText('4 ml do aberto + abrir 1 lacrado (6 ml)')).toBeInTheDocument()
    expect(screen.getByLabelText('Item 1: Etiqueta')).toHaveValue(1)
    expect(screen.getByLabelText('Item 2: Frasco 10 ml')).toHaveValue(1)
    expect(screen.queryByLabelText('Item 2: Etiqueta')).toBeNull()
    expect(screen.getByLabelText('Envio: Caixinha')).toHaveValue(2)

    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))
    await waitFor(() => expect(payload('editar_venda')).toBeDefined())
    const p = payload('editar_venda')
    expect(p.p_itens[0].insumos).toEqual([{ insumo_id: 'i-etiq', quantidade: 1 }])
    expect(p.p_itens[1]).toMatchObject({
      decant_id: 'd1',
      origens: [{ frasco_id: 'f1', ml: 4 }, { abrir_produto_id: 'p1', ml: 6 }],
      insumos: [{ insumo_id: 'i-frasco10', quantidade: 1 }],
    })
    expect(p.p_itens[1]).not.toHaveProperty('custo_unitario')
    expect(p.p_insumos_envio).toEqual([{ insumo_id: 'i-caixa', quantidade: 2 }])
  })

  it('edição que muda o ml planeja com os ml devolvidos pela própria venda', async () => {
    // a venda esvaziou f1 (4 ml) e abriu f9 (6 ml): f1 esgotado, f9 ativo com 94 ml
    db.frascos_abertos = [
      { id: 'f1', produto_id: 'p1', ml_restante: 0, ml_total: 100, status: 'esgotado', produtos: { nome: 'Perfume X', custo_medio: 100 } },
      { id: 'f9', produto_id: 'p1', ml_restante: 94, ml_total: 100, status: 'ativo', produtos: { nome: 'Perfume X', custo_medio: 100 } },
    ]
    db.venda_itens = [
      { id: 'vi-decant', venda_id: 'v1', tipo: 'decant', produto_id: 'p1', frasco_id: 'f1', decant_id: 'd1', ml: 10, quantidade: 1, preco_unitario: 50, custo_unitario: 10, custo_embalagem: 0 },
    ]
    db.decant_origens = [
      { decant_id: 'd1', frasco_id: 'f1', produto_id: 'p1', ml: 4, abriu_frasco: false },
      { decant_id: 'd1', frasco_id: 'f9', produto_id: 'p1', ml: 6, abriu_frasco: true },
    ]
    render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('ml')).toHaveValue('10'))
    escolher(screen.getByLabelText('ml'), '5')
    expect(screen.queryByText(/faltam/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /salvar altera/i }))
    await waitFor(() => expect(payload('editar_venda')).toBeDefined())
    const item = payload('editar_venda').p_itens[0]
    expect(item.origens).toEqual([{ frasco_id: 'f9', ml: 5 }])
    expect(item).not.toHaveProperty('decant_id')
  })

  it('decant de perfume sem frasco aberto, só lacrado: escolhe o lacrado e abre um', async () => {
    db.produtos.push({ id: 'p3', nome: 'Perfume Z', estoque_atual: 1, custo_medio: 150, preco_referencia: 250, volume_ml: 50 })
    render(<NovaVendaModal open onClose={vi.fn()} onSaved={vi.fn()} />)
    await waitFor(() => expect(opcoes(screen.getByLabelText('Canal'))).toHaveLength(3))
    escolher(screen.getByLabelText('Canal'), 'c2')
    escolher(screen.getByLabelText('Tipo'), 'decant')
    escolher(screen.getByLabelText('Frasco aberto'), 'lacrado:p3')
    escolher(screen.getByLabelText('ml'), '5')
    fireEvent.change(screen.getByLabelText('Preço un.'), { target: { value: '50' } })
    expect(screen.getByText(/abrir 1 lacrado/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /registrar venda/i }))
    await waitFor(() => expect(payload('registrar_venda')).toBeDefined())
    expect(payload('registrar_venda').p_itens[0]).toMatchObject({
      tipo: 'decant', produto_id: 'p3', frasco_id: null, ml: 5, origens: [{ abrir_produto_id: 'p3', ml: 5 }],
    })
  })
})
