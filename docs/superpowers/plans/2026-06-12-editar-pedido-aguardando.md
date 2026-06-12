# Edição de Pedido Aguardando — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar fornecedor, previsão de chegada e itens de pedidos com status `aguardando`.

**Architecture:** `NovoPedidoModal` recebe prop opcional `pedidoParaEditar` que ativa modo de edição — pré-preenche estado via query ao banco, muda título/botão e usa UPDATE+DELETE+INSERT no submit. `Pedidos.tsx` adiciona campo `fornecedor_id` em `PedidoRow`, estado `editando` e botão "Editar" para linhas `aguardando`.

**Tech Stack:** React 19 + TypeScript + Supabase client · Vitest + Testing Library

---

### Task 1: Escrever testes que falham para o modo de edição

**Files:**
- Modify: `frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx`

- [ ] **Passo 1: Substituir o bloco `vi.mock` pelo mock estendido**

Substitua as declarações de `inserts` e o bloco `vi.mock('@/lib/supabase', ...)` inteiros pelo seguinte:

```typescript
const inserts: Record<string, unknown[]> = { pedidos: [], pedido_itens: [], produtos: [] }
const updates: Record<string, unknown[]> = { pedidos: [] }
const deletes: Record<string, string[]> = { pedido_itens: [] }

const mockItemEditar = { produto_id: 'pr1', qtd_pedida: 3, preco_unitario: 150 }

vi.mock('@/lib/supabase', () => ({
  supabase: {
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
            single: vi.fn(() => Promise.resolve({ data: { id: 'novo-id' }, error: null })),
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
```

- [ ] **Passo 2: Adicionar `updates` e `deletes` ao `beforeEach`**

Substitua o `beforeEach` dentro do `describe`:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  inserts.pedidos.length = 0
  inserts.pedido_itens.length = 0
  inserts.produtos.length = 0
  updates.pedidos.length = 0
  deletes.pedido_itens.length = 0
})
```

- [ ] **Passo 3: Atualizar os três testes existentes: `onCreated` → `onSaved`**

Nos três testes existentes, substitua todas as ocorrências de `onCreated={vi.fn()}` por `onSaved={vi.fn()}` e `onCreated` por `onSaved`.

- [ ] **Passo 4: Adicionar os dois novos testes (falharão por enquanto)**

Cole antes do fechamento do `describe`:

```typescript
  it('pré-preenche fornecedor, previsão e itens no modo edição', async () => {
    render(
      <NovoPedidoModal
        open
        onClose={vi.fn()}
        onSaved={vi.fn()}
        pedidoParaEditar={{ id: 'p-edit', numero: 7, fornecedor_id: 'f1', previsao_chegada: '2026-07-01' }}
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
        pedidoParaEditar={{ id: 'p-edit', numero: 7, fornecedor_id: 'f1', previsao_chegada: null }}
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
```

- [ ] **Passo 5: Rodar para confirmar que os novos falham**

```
cd frontend && npx vitest run src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
```

Esperado: 3 PASS (existentes), 2 FAIL (prop desconhecida / botão não encontrado).

- [ ] **Passo 6: Commit**

```
git add frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
git commit -m "test: testes falhando para modo edicao de pedido"
```

---

### Task 2: Implementar modo edição em NovoPedidoModal

**Files:**
- Modify: `frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx`

- [ ] **Passo 1: Atualizar interface Props e adicionar tipo auxiliar**

Substitua a interface `Props` existente:

```typescript
interface ItensOriginal {
  produto_id: string
  qtd_pedida: number
  preco_unitario: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  pedidoParaEditar?: {
    id: string
    numero: number
    fornecedor_id: string
    previsao_chegada: string | null
  }
}
```

- [ ] **Passo 2: Adicionar estado `itensOriginais` no corpo do componente**

Após `const [erro, setErro] = useState<string | null>(null)`, adicione:

```typescript
const [itensOriginais, setItensOriginais] = useState<ItensOriginal[]>([])
```

- [ ] **Passo 3: Substituir o `useEffect` para cobrir ambos os modos**

Substitua o `useEffect` existente inteiro:

```typescript
useEffect(() => {
  if (!open) return
  Promise.all([
    supabase.from('fornecedores').select('id, nome').order('nome'),
    supabase.from('produtos').select('id, nome').order('nome'),
    supabase.from('categorias').select('id, nome').order('nome'),
  ]).then(([f, p, c]) => {
    setFornecedores(f.data || [])
    setProdutos(p.data || [])
    setCategorias(c.data || [])
  })

  if (pedidoParaEditar) {
    setFornecedorId(pedidoParaEditar.fornecedor_id)
    setPrevisao(pedidoParaEditar.previsao_chegada || '')
    supabase
      .from('pedido_itens')
      .select('produto_id, qtd_pedida, preco_unitario')
      .eq('pedido_id', pedidoParaEditar.id)
      .then(({ data }) => {
        const items = (data as ItensOriginal[]) || []
        setItensOriginais(items)
        setItens(
          items.length > 0
            ? items.map(i => ({
                produto_id: i.produto_id,
                qtd: String(i.qtd_pedida),
                preco: String(i.preco_unitario),
              }))
            : [{ ...ITEM_VAZIO }]
        )
      })
  } else {
    setFornecedorId('')
    setPrevisao('')
    setItens([{ ...ITEM_VAZIO }])
    setItensOriginais([])
  }
}, [open, pedidoParaEditar?.id])
```

Nota: a dep é `pedidoParaEditar?.id` (não o objeto inteiro) para evitar re-runs quando o pai recria o objeto inline.

- [ ] **Passo 4: Adicionar `handleCreateSubmit` e `handleEditSubmit` antes de `handleSubmit`**

Substitua a função `handleSubmit` existente pelas três funções a seguir:

```typescript
async function handleCreateSubmit(validos: ItemForm[]) {
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .insert({
      fornecedor_id: fornecedorId,
      previsao_chegada: previsao || null,
      valor_total: calcularTotalPedido(validos.map(i => ({ qtd: Number(i.qtd), preco: Number(i.preco) || 0 }))),
      responsavel: user?.email || null,
    })
    .select()
    .single()
  if (error || !pedido) throw new Error(error?.message || 'Falha ao criar pedido')

  const { error: itensError } = await supabase.from('pedido_itens').insert(
    validos.map(i => ({
      pedido_id: pedido.id,
      produto_id: i.produto_id,
      qtd_pedida: Number(i.qtd),
      preco_unitario: Number(i.preco) || 0,
    }))
  )
  if (itensError) {
    await supabase.from('pedidos').delete().eq('id', pedido.id)
    throw new Error(itensError.message)
  }
}

async function handleEditSubmit(validos: ItemForm[]) {
  const valor_total = calcularTotalPedido(
    validos.map(i => ({ qtd: Number(i.qtd), preco: Number(i.preco) || 0 }))
  )
  const { error: updateError } = await supabase
    .from('pedidos')
    .update({ fornecedor_id: fornecedorId, previsao_chegada: previsao || null, valor_total })
    .eq('id', pedidoParaEditar!.id)
    .eq('status', 'aguardando')
  if (updateError) throw new Error(updateError.message)

  const { error: deleteError } = await supabase
    .from('pedido_itens')
    .delete()
    .eq('pedido_id', pedidoParaEditar!.id)
  if (deleteError) throw new Error(deleteError.message)

  const { error: insertError } = await supabase.from('pedido_itens').insert(
    validos.map(i => ({
      pedido_id: pedidoParaEditar!.id,
      produto_id: i.produto_id,
      qtd_pedida: Number(i.qtd),
      preco_unitario: Number(i.preco) || 0,
    }))
  )
  if (insertError) {
    if (itensOriginais.length > 0) {
      await supabase.from('pedido_itens').insert(
        itensOriginais.map(i => ({ pedido_id: pedidoParaEditar!.id, ...i }))
      )
    }
    throw new Error(insertError.message)
  }
}

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (submitting || duplicado) return
  setErro(null)
  const preenchidos = itens.filter(i => i.produto_id || i.preco || Number(i.qtd) > 1)
  const validos = preenchidos.filter(i => i.produto_id && Number(i.qtd) >= 1)
  if (!fornecedorId || validos.length === 0) {
    setErro('Selecione o fornecedor e ao menos um item válido')
    return
  }
  if (validos.length !== preenchidos.length) {
    setErro('Há itens incompletos — selecione o produto e informe quantidade ≥ 1, ou remova a linha')
    return
  }
  setSubmitting(true)
  try {
    if (pedidoParaEditar) {
      await handleEditSubmit(validos)
    } else {
      await handleCreateSubmit(validos)
    }
    onSaved()
    onClose()
  } catch (err) {
    setErro(err instanceof Error ? err.message : 'Erro ao salvar pedido')
  } finally {
    setSubmitting(false)
  }
}
```

- [ ] **Passo 5: Atualizar título e botão no JSX**

Substitua a tag de abertura do `<Modal>`:

```tsx
<Modal
  open={open}
  onClose={onClose}
  title={pedidoParaEditar ? `Editar pedido #${pedidoParaEditar.numero}` : 'Novo pedido'}
  size="lg"
>
```

Substitua o botão de submit no rodapé:

```tsx
<Button type="submit" disabled={submitting || duplicado}>
  {submitting
    ? (pedidoParaEditar ? 'Salvando...' : 'Criando...')
    : (pedidoParaEditar ? 'Salvar alterações' : 'Criar pedido')}
</Button>
```

- [ ] **Passo 6: Rodar os testes do modal**

```
cd frontend && npx vitest run src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
```

Esperado: 5/5 PASS.

- [ ] **Passo 7: Commit**

```
git add frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx
git commit -m "feat: modo edicao no NovoPedidoModal (pedidoParaEditar prop)"
```

---

### Task 3: Adicionar botão Editar em Pedidos.tsx

**Files:**
- Modify: `frontend/src/pages/estoque/Pedidos.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/Pedidos.test.tsx`

- [ ] **Passo 1: Adicionar `fornecedor_id` à interface `PedidoRow`**

Substitua a interface `PedidoRow`:

```typescript
export interface PedidoRow {
  id: string
  numero: number
  status: PedidoStatus
  valor_total: number
  previsao_chegada: string | null
  responsavel: string | null
  created_at: string
  fornecedor_id: string
  fornecedores: { nome: string } | null
  pedido_itens: { id: string }[]
}
```

- [ ] **Passo 2: Adicionar estado `editando` e atualizar `NovoPedidoModal` no JSX**

Após `const [cancelSubmitting, setCancelSubmitting] = useState(false)`, adicione:

```typescript
const [editando, setEditando] = useState<PedidoRow | null>(null)
```

Substitua a linha `<NovoPedidoModal open={novoOpen} onClose={...} onCreated={fetchData} />`:

```tsx
<NovoPedidoModal
  open={novoOpen || !!editando}
  onClose={() => { setNovoOpen(false); setEditando(null) }}
  onSaved={fetchData}
  pedidoParaEditar={editando ? {
    id: editando.id,
    numero: editando.numero,
    fornecedor_id: editando.fornecedor_id,
    previsao_chegada: editando.previsao_chegada,
  } : undefined}
/>
```

- [ ] **Passo 3: Adicionar botão "Editar" na linha de ações**

Substitua o bloco de botões `{p.status === 'aguardando' && (...)}`:

```tsx
{p.status === 'aguardando' && (
  <div className="flex items-center justify-end gap-2">
    <Button size="sm" onClick={() => setConferindo(p)}>
      Confirmar chegada
    </Button>
    <Button size="sm" variant="secondary" onClick={() => setEditando(p)}>
      Editar
    </Button>
    <Button size="sm" variant="ghost" onClick={() => setCancelando(p)}>
      Cancelar
    </Button>
  </div>
)}
```

- [ ] **Passo 4: Atualizar `mockPedidos` em Pedidos.test.tsx para incluir `fornecedor_id`**

Substitua os dois objetos em `mockPedidos`:

```typescript
const mockPedidos: PedidoRow[] = [
  {
    id: 'p1', numero: 1, status: 'aguardando', valor_total: 890,
    previsao_chegada: '2026-06-11', responsavel: 'Luis',
    created_at: '2026-06-10T12:00:00Z',
    fornecedor_id: 'f1',
    fornecedores: { nome: 'Essências Cairo' },
    pedido_itens: [{ id: 'i1' }, { id: 'i2' }],
  },
  {
    id: 'p2', numero: 2, status: 'recebido', valor_total: 300,
    previsao_chegada: null, responsavel: 'Ana',
    created_at: '2026-06-09T12:00:00Z',
    fornecedor_id: 'f2',
    fornecedores: { nome: 'Aromas SP' },
    pedido_itens: [{ id: 'i3' }],
  },
]
```

- [ ] **Passo 5: Rodar todos os testes**

```
cd frontend && npx vitest run
```

Esperado: todos PASS.

- [ ] **Passo 6: Verificar build**

```
cd frontend && npm run build
```

Esperado: sem erros de TypeScript ou bundling.

- [ ] **Passo 7: Commit final**

```
git add frontend/src/pages/estoque/Pedidos.tsx frontend/src/pages/estoque/__tests__/Pedidos.test.tsx
git commit -m "feat: botao Editar para pedidos aguardando"
```
