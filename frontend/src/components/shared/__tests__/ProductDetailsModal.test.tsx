import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductDetailsModal, type Produto } from '../ProductDetailsModal'

const { mockDeleteEq, mockRpc, mockUpdate, mockUpdateEq, mockGetSession } = vi.hoisted(() => ({
  mockDeleteEq: vi.fn(),
  mockRpc: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
    rpc: mockRpc,
    from: vi.fn(() => ({
      update: mockUpdate,
      delete: vi.fn(() => ({
        eq: mockDeleteEq,
      })),
    })),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'luis@example.com' } }),
}))

const produto: Produto = {
  id: 'p1',
  nome: 'Asad',
  volume_ml: 100,
  preco_referencia: 120,
  categoria_id: 'c1',
  fornecedor_id: 'f1',
  marca_id: 'm1',
  estoque_atual: 3,
  estoque_minimo: 1,
  foto_url: null,
  created_at: '2026-06-22T00:00:00Z',
  categorias: { nome: 'Masculino' },
  fornecedores: { nome: 'Cairo' },
  marcas: { nome: 'Lattafa' },
}

describe('ProductDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: mockUpdateEq })
    mockUpdateEq.mockResolvedValue({ error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt-produto' } },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        produto_id: 'p1',
        periodo_dias: 90,
        unidades_vendidas: 12,
        media_diaria: 0.13,
        dias_reposicao: 15,
        margem_seguranca: 0.3,
        estoque_minimo_sugerido: 3,
        tem_dados: true,
      }),
    }))

    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.open = false
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mostra sugestao de estoque minimo por vendas', async () => {
    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    const heading = await screen.findByText(/sugestao por vendas/i)
    const blocoSugestao = heading.closest('[data-testid="sugestao-estoque-minimo"]')
    expect(blocoSugestao).not.toBeNull()
    expect(within(blocoSugestao as HTMLElement).getByText('3')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/estoque/produtos/p1/estoque-minimo-sugerido'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-produto' }),
      })
    )
  })

  it('usa sugestao para preencher estoque minimo no modo edicao', async () => {
    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(await screen.findByRole('button', { name: /usar sugestao/i }))

    expect(screen.getByLabelText(/estoque minimo/i)).toHaveValue(3)
  })

  it('mostra estado sem dados quando nao ha vendas suficientes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        produto_id: 'p1',
        periodo_dias: 90,
        unidades_vendidas: 0,
        media_diaria: 0,
        dias_reposicao: 15,
        margem_seguranca: 0.3,
        estoque_minimo_sugerido: null,
        tem_dados: false,
      }),
    } as Response)

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    expect(await screen.findByText(/ainda sem vendas suficientes/i)).toBeInTheDocument()
  })

  it('mostra erro quando o banco bloqueia a exclusao do produto', async () => {
    mockDeleteEq.mockResolvedValueOnce({
      error: {
        message: 'update or delete on table "produtos" violates foreign key constraint',
      },
    })

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /^excluir$/i })[1])

    await waitFor(() => {
      expect(screen.getByText(/nao foi possivel excluir/i)).toBeInTheDocument()
    })
  })

  it('remove produto apenas do estoque quando aberto pela tela de estoque', async () => {
    const onUpdated = vi.fn()
    const onClose = vi.fn()
    mockRpc.mockResolvedValueOnce({ error: null })

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
        estoqueAction="removeFromStock"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /remover do estoque/i }))
    fireEvent.click(screen.getByRole('button', { name: /^remover$/i }))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('registrar_saida', {
        p_produto_id: 'p1',
        p_qtd: 3,
        p_motivo: 'Removido do estoque',
        p_responsavel: 'luis@example.com',
      })
    })
    expect(mockDeleteEq).not.toHaveBeenCalled()
    expect(onUpdated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
  it('edita cadastro sem permitir alterar estoque atual', async () => {
    const onUpdated = vi.fn()

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect(screen.queryByLabelText(/estoque atual/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Asad Lattafa' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    expect(mockUpdate).toHaveBeenCalledWith(expect.not.objectContaining({
      estoque_atual: expect.anything(),
    }))
  })
  it('nao envia marca_id ao salvar produto recebido sem suporte a marca', async () => {
    const onUpdated = vi.fn()
    const { marca_id, marcas, ...produtoSemMarcaField } = produto

    render(
      <ProductDetailsModal
        open
        produto={produtoSemMarcaField}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        onClose={vi.fn()}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Asad Legacy' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    const payload = mockUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('marca_id')
  })
  it('exibe a marca no modo leitura', async () => {
    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }]}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />
    )

    expect(screen.getByText('Marca')).toBeInTheDocument()
    expect(screen.getByText('Lattafa')).toBeInTheDocument()
  })

  it('edita marca do produto', async () => {
    const onUpdated = vi.fn()

    render(
      <ProductDetailsModal
        open
        produto={produto}
        categorias={[{ id: 'c1', nome: 'Masculino' }]}
        fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
        marcas={[{ id: 'm1', nome: 'Lattafa' }, { id: 'm2', nome: 'Armaf' }]}
        onClose={vi.fn()}
        onUpdated={onUpdated}
        onDeleted={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'm2' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      marca_id: 'm2',
    }))
  })
})
