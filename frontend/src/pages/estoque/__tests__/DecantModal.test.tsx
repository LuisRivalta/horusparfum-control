// frontend/src/pages/estoque/__tests__/DecantModal.test.tsx
import { escolher } from '@/test/escolher'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DecantModal } from '../decants/DecantModal'

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('@/pages/estoque/decants/FrascoViewer', () => ({
  FrascoViewer: ({ percentual }: { percentual: number }) => (
    <div data-testid="frasco-viewer" data-pct={percentual} />
  ),
}))

const tabelas: Record<string, unknown> = {}
function tabela(nome: string) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) q[m] = () => q
  q.single = () => Promise.resolve({ data: tabelas[nome] })
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[nome] }).then(res)
  return q
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (nome: string) => tabela(nome), rpc: rpcMock },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
}))

const mockFrasco = {
  id: 'f1',
  produto_id: 'p1',
  ml_total: 100,
  ml_restante: 70,
  status: 'ativo' as const,
  aberto_em: '2026-06-15T10:00:00Z',
  produtos: { nome: 'Asad', foto_url: null, volume_ml: 100, custo_medio: 5.0 },
}

describe('DecantModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    rpcMock.mockResolvedValue({ error: null })
    tabelas.insumo_listas = [
      { tipo: 'decant', tamanho_ml: 2.5, insumo_lista_itens: [] },
      { tipo: 'decant', tamanho_ml: 5, insumo_lista_itens: [{ insumo_id: 'i1', quantidade: 1 }] },
      { tipo: 'decant', tamanho_ml: 10, insumo_lista_itens: [{ insumo_id: 'i1', quantidade: 1 }] },
    ]
    tabelas.insumos = [{ id: 'i1', nome: 'Frasquinho', custo_medio: 2, ativo: true }]
    tabelas.produtos = { estoque_atual: 0 }
    tabelas.frascos_abertos = []
  })

  it('mostra nome do perfume e ml disponível', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(screen.getByText(/Consumo — Asad/)).toBeInTheDocument()
    expect(screen.getByText(/70/)).toBeInTheDocument()
  })

  it('botão rápido de 10ml seleciona o valor e mostra previsão', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('10ml'))
    expect(screen.getByText(/60ml/)).toBeInTheDocument()
  })

  it('renderiza select de classificação', () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Selecione...')
  })

  it('chama onSaved após registrar consumo com sucesso', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('10ml'))
    // Select classification
    const selects = screen.getAllByRole('combobox')
    escolher(selects[0], 'amostra')
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    await waitFor(() => expect(mockOnSaved).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('oferece o tamanho de 2,5 ml vindo das listas', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    expect(await screen.findByText('2,5ml')).toBeInTheDocument()
  })

  it('brinde pré-preenche insumos do tamanho e envia p_insumos', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('5ml'))
    escolher(screen.getAllByRole('combobox')[0], 'brinde')
    expect(screen.getByLabelText('Decant: Frasquinho')).toHaveValue(1)
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('registrar_consumo_decant', expect.objectContaining({
      p_ml: 5, p_classificacao: 'brinde', p_custo_embalagem: 2, p_origens: null,
      p_insumos: [{ insumo_id: 'i1', quantidade: 1 }],
    }))
  })

  it('perda não envia insumos', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('5ml'))
    escolher(screen.getAllByRole('combobox')[0], 'perda')
    expect(screen.queryByText('Insumos do decant')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('registrar_consumo_decant', expect.objectContaining({ p_insumos: [], p_custo_embalagem: 0 }))
  })

  it('insumo inativo da lista não é pré-preenchido nem consumido', async () => {
    tabelas.insumos = [{ id: 'i1', nome: 'Frasquinho', custo_medio: 2, ativo: false }]
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('5ml'))
    escolher(screen.getAllByRole('combobox')[0], 'brinde')
    expect(screen.queryByLabelText('Decant: Frasquinho')).toBeNull()
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('registrar_consumo_decant', expect.objectContaining({ p_insumos: [], p_custo_embalagem: 0 }))
  })

  it('ml custom é arredondado para 1 casa (coluna numeric(6,1))', async () => {
    render(<DecantModal frasco={mockFrasco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    await screen.findByText('5ml')
    fireEvent.change(screen.getByPlaceholderText('ML'), { target: { value: '2.55' } })
    escolher(screen.getAllByRole('combobox')[0], 'amostra')
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('registrar_consumo_decant', expect.objectContaining({ p_ml: 2.6 }))
  })

  it('frasco insuficiente envia p_origens com abrir lacrado', async () => {
    tabelas.produtos = { estoque_atual: 2 }
    const pouco = { ...mockFrasco, ml_restante: 3 }
    render(<DecantModal frasco={pouco} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(await screen.findByText('5ml'))
    escolher(screen.getAllByRole('combobox')[0], 'brinde')
    await waitFor(() => expect(screen.getByText(/abrir 1 lacrado/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Registrar consumo'))
    await waitFor(() => expect(rpcMock).toHaveBeenCalled())
    expect(rpcMock).toHaveBeenCalledWith('registrar_consumo_decant', expect.objectContaining({
      p_origens: [{ frasco_id: 'f1', ml: 3 }, { abrir_produto_id: 'p1', ml: 2 }],
    }))
  })
})
