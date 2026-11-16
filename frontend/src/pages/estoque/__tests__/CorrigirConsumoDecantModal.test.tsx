import { escolher } from '@/test/escolher'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorrigirConsumoDecantModal } from '../decants/CorrigirConsumoDecantModal'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
const tabelas: Record<string, unknown> = {}
function tabela(nome: string) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
  q.single = () => Promise.resolve({ data: tabelas[nome] })
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[nome] }).then(res)
  return q
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: (n: string) => tabela(n), rpc: rpcMock } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { email: 'a@b.c' } }) }))

const transacao = { id: 't1', descricao: 'Brinde - 5ml Asad', valor: 3, responsavel: null, decant_id: 'd1' }

describe('CorrigirConsumoDecantModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcMock.mockResolvedValue({ error: null })
    tabelas.decants = { ml: 5, classificacao: 'brinde', produto_id: 'p1' }
    // o decant abriu o lacrado fNovo (ativo); a RPC devolve os 5 ml antes de regravar
    tabelas.decant_origens = [{ frasco_id: 'fNovo', produto_id: 'p1', ml: 5, abriu_frasco: true }]
    tabelas.insumo_movimentacoes = [{ insumo_id: 'i1', quantidade: -1 }]
    tabelas.insumos = [{ id: 'i1', nome: 'Frasquinho', custo_medio: 2, ativo: true }]
    tabelas.frascos_abertos = [{ id: 'fNovo', produto_id: 'p1', ml_restante: 95, ml_total: 100, status: 'ativo' }]
    tabelas.produtos = { estoque_atual: 3, volume_ml: 100 }
  })

  it('muda só a classificação: origens usam o frasco ativo, sem abrir lacrado', async () => {
    render(<CorrigirConsumoDecantModal open transacao={transacao} onClose={vi.fn()} onSaved={vi.fn()} />)
    await screen.findByLabelText('Decant: Frasquinho')
    escolher(screen.getAllByRole('combobox')[0], 'marketing')
    fireEvent.click(screen.getByText('Salvar correção'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('corrigir_consumo_decant', expect.objectContaining({
      p_classificacao: 'marketing', p_origens: [{ frasco_id: 'fNovo', ml: 5 }],
    }))
  })

  it('remover todos os insumos envia p_insumos vazio e custo 0', async () => {
    // custo de embalagem gravado diferente de 0: o teste só passa se a tela recalcula
    tabelas.decants = { ml: 5, classificacao: 'brinde', produto_id: 'p1', custo_embalagem: 2 }
    render(<CorrigirConsumoDecantModal open transacao={transacao} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(await screen.findByLabelText('Remover Frasquinho'))
    fireEvent.click(screen.getByText('Salvar correção'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('corrigir_consumo_decant', expect.objectContaining({ p_insumos: [], p_custo_embalagem: 0 }))
  })

  it('consumo antigo sem decant_origens: devolve decants.frasco_id/ml como a RPC', async () => {
    // o consumo esvaziou fVelho; sem lacrado, só a devolução dos 5 ml permite regravar
    tabelas.decants = { ml: 5, classificacao: 'brinde', produto_id: 'p1', frasco_id: 'fVelho' }
    tabelas.decant_origens = []
    tabelas.frascos_abertos = [{ id: 'fVelho', produto_id: 'p1', ml_restante: 0, ml_total: 100, status: 'esgotado' }]
    tabelas.produtos = { estoque_atual: 0, volume_ml: 100 }
    render(<CorrigirConsumoDecantModal open transacao={transacao} onClose={vi.fn()} onSaved={vi.fn()} />)
    await screen.findByLabelText('Decant: Frasquinho')
    fireEvent.click(screen.getByText('Salvar correção'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('corrigir_consumo_decant', expect.objectContaining({ p_origens: [{ frasco_id: 'fVelho', ml: 5 }] }))
  })

  it('ml é arredondado para 1 casa (coluna numeric(6,1))', async () => {
    render(<CorrigirConsumoDecantModal open transacao={transacao} onClose={vi.fn()} onSaved={vi.fn()} />)
    await screen.findByLabelText('Decant: Frasquinho')
    fireEvent.change(screen.getByLabelText('ml'), { target: { value: '4.96' } })
    fireEvent.click(screen.getByText('Salvar correção'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('corrigir_consumo_decant', expect.objectContaining({ p_ml: 5, p_origens: [{ frasco_id: 'fNovo', ml: 5 }] }))
  })
})
