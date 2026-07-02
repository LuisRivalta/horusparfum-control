import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NovoPedidoModal } from '../pedidos/NovoPedidoModal'

const inserts: Record<string, unknown[]> = { pedidos: [], pedido_itens: [], produtos: [] }
const updates: Record<string, unknown[]> = { pedidos: [] }
const deletes: Record<string, string[]> = { pedido_itens: [] }
const getSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve({
  data: { session: { access_token: 'jwt-test' } },
})))
const pedidoInsertError = vi.hoisted(() => ({ value: null as { message: string } | null }))

const mockItemEditar = { produto_id: 'pr1', qtd_pedida: 3, preco_unitario: 150 }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: table === 'fornecedores'
            ? [{ id: 'f1', nome: 'Essências Cairo' }]
            : table === 'produtos'
              ? [{ id: 'pr1', nome: 'Perfume X' }, { id: 'pr2', nome: 'Perfume Y' }]
              : [],
          error: null,
        })),
        eq: vi.fn(() => Promise.resolve({
          data: table === 'pedido_itens' ? [mockItemEditar] : [],
          error: null,
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        inserts[table]?.push(payload)
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => {
              if (table === 'pedidos' && pedidoInsertError.value) {
                return Promise.resolve({ data: null, error: pedidoInsertError.value })
              }
              return Promise.resolve({ data: { id: 'novo-id' }, error: null })
            }),
          })),
        }
      }),
      update: vi.fn((payload: unknown) => {
        updates[table]?.push(payload)
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        }
      }),
      delete: vi.fn(() => ({
        eq: vi.fn((col: string, val: string) => {
          if (col === 'pedido_id') deletes['pedido_itens']?.push(val)
          return Promise.resolve({ error: null })
        }),
      })),
    })),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'teste@horus.com' }, signOut: vi.fn() }),
}))

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('NovoPedidoModal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    inserts.pedidos.length = 0
    inserts.pedido_itens.length = 0
    inserts.produtos.length = 0
    updates.pedidos.length = 0
    deletes.pedido_itens.length = 0
    pedidoInsertError.value = null
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'jwt-test' } },
    })
  })

  it('mostra importação de PDF como botão visível na seção de itens', async () => {
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    const importar = await screen.findByRole('button', { name: /importar pdf/i })

    expect(importar).toHaveClass('border')
    expect(importar).toHaveClass('bg-surface-2')
  })

  it('calcula o total ao vivo conforme itens são preenchidos', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/total do pedido/i)).toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')

    expect(screen.getByText('R$ 500,00')).toBeInTheDocument()
  })

  it('bloqueia produto repetido em duas linhas', async () => {
    const user = userEvent.setup()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.click(screen.getByRole('button', { name: /adicionar item/i }))
    await user.selectOptions(screen.getByLabelText(/produto 2/i), 'pr1')

    expect(screen.getByText(/produto repetido/i)).toBeInTheDocument()
  })

  it('mostra erro ao tentar criar pedido com produto repetido', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.click(screen.getByRole('button', { name: /adicionar item/i }))
    await user.selectOptions(screen.getByLabelText(/produto 2/i), 'pr1')
    await user.clear(screen.getByLabelText(/preço 2/i))
    await user.type(screen.getByLabelText(/preço 2/i), '100')

    const criarPedido = screen.getByRole('button', { name: /criar pedido/i })
    expect(criarPedido).not.toBeDisabled()
    await user.click(criarPedido)

    await waitFor(() => {
      expect(screen.getByText(/há produtos repetidos/i)).toBeInTheDocument()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(inserts.pedidos).toHaveLength(0)
  })

  it('submete pedido e itens com payload correto', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(inserts.pedidos[0]).toMatchObject({
      fornecedor_id: 'f1',
      valor_total: 500,
      responsavel: 'teste@horus.com',
    })
    expect(inserts.pedido_itens[0]).toEqual([
      { pedido_id: 'novo-id', produto_id: 'pr1', qtd_pedida: 5, preco_unitario: 100 },
    ])
  })

  it('pré-preenche fornecedor, previsão e itens no modo edição', async () => {
    render(
      <NovoPedidoModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        pedidoParaEditar={{ id: 'p-edit', numero: 7, fornecedor_id: 'f1', previsao_chegada: '2026-07-01', valor_total: 450 }}
      />
    )

    await waitFor(() => {
      expect((screen.getByLabelText(/fornecedor/i) as HTMLSelectElement).value).toBe('f1')
    })
    expect((screen.getByLabelText(/previsão/i) as HTMLInputElement).value).toBe('2026-07-01')
    expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')
    expect((screen.getByLabelText(/qtd 1/i) as HTMLInputElement).value).toBe('3')
    expect((screen.getByLabelText(/preço 1/i) as HTMLInputElement).value).toBe('150')
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeInTheDocument()
  })

  it('submit no modo edição chama update, delete e insert com dados corretos', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(
      <NovoPedidoModal
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        pedidoParaEditar={{ id: 'p-edit', numero: 7, fornecedor_id: 'f1', previsao_chegada: null, valor_total: 450 }}
      />
    )

    // aguarda pré-preenchimento
    await waitFor(() =>
      expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')
    )

    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updates.pedidos[0]).toMatchObject({ fornecedor_id: 'f1', valor_total: 450 })
    expect(deletes.pedido_itens[0]).toBe('p-edit')
    expect(inserts.pedido_itens[0]).toEqual([
      { pedido_id: 'p-edit', produto_id: 'pr1', qtd_pedida: 3, preco_unitario: 150 },
    ])
  })

  it('importa PDF e preenche item com produto encontrado', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        itens: [{ nome: 'Perfume X', codigo: 'DB-X', qtd: 2, preco_unitario: 123.45, total: 246.9 }],
        avisos: [],
      }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /importar pdf/i })).toBeInTheDocument())
    const file = new File(['%PDF fake'], 'pedido.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), file)

    await waitFor(() => {
      expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')
    })
    expect((screen.getByLabelText(/qtd 1/i) as HTMLInputElement).value).toBe('2')
    expect((screen.getByLabelText(/preço 1/i) as HTMLInputElement).value).toBe('123.45')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/estoque/pedidos/importar-pdf'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-test' },
      }),
    )
  })

  it('importa PDF e mantém item sem match pendente', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        itens: [{ nome: 'Produto Novo 200ML', codigo: 'DB-NOVO', qtd: 1, preco_unitario: 99.99 }],
        avisos: [],
      }),
    })))

    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/arquivo pdf do pedido/i)).toBeInTheDocument())
    await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), new File(['%PDF fake'], 'pedido.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(screen.getByText(/produto não encontrado: produto novo 200ml/i)).toBeInTheDocument())
    expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('')
  })

  it('preserva itens atuais quando importação falha', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: 'PDF sem texto extraível' }),
    })))

    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), new File(['bad'], 'pedido.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(screen.getByText(/pdf sem texto extraível/i)).toBeInTheDocument())
    expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')
  })

  it('bloqueia criação com item importado sem produto selecionado', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        itens: [{ nome: 'Produto Novo 200ML', codigo: 'DB-NOVO', qtd: 1, preco_unitario: 99.99 }],
        avisos: [],
      }),
    })))

    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), new File(['%PDF fake'], 'pedido.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(screen.getByText(/produto não encontrado: produto novo 200ml/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => expect(screen.getByText(/selecione o fornecedor e ao menos um item válido/i)).toBeInTheDocument())
    expect(onSaved).not.toHaveBeenCalled()
    expect(inserts.pedidos).toHaveLength(0)
  })

  it('inclui frete no total e no payload do pedido', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/qtd 1/i))
    await user.type(screen.getByLabelText(/qtd 1/i), '5')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.type(screen.getByLabelText(/frete/i), '25')

    expect(screen.getByText('R$ 525,00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(inserts.pedidos[0]).toMatchObject({
      fornecedor_id: 'f1',
      frete: 25,
      valor_total: 525,
      responsavel: 'teste@horus.com',
    })
  })

  it('orienta aplicar migration quando o banco ainda nao tem frete', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    pedidoInsertError.value = { message: 'schema cache missing frete column on pedidos' }

    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/fornecedor/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 'f1')
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => {
      expect(screen.getByText(/aplique a migration de frete/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/20260702142406_frete_pedidos/i)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('mostra erro visivel ao criar sem fornecedor', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<NovoPedidoModal open onClose={vi.fn()} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
    await user.clear(screen.getByLabelText(/preço 1/i))
    await user.type(screen.getByLabelText(/preço 1/i), '100')
    await user.click(screen.getByRole('button', { name: /criar pedido/i }))

    await waitFor(() => {
      expect(screen.getByText(/selecione o fornecedor e ao menos um item válido/i)).toBeInTheDocument()
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(inserts.pedidos).toHaveLength(0)
  })
})
