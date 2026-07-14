# Correcao Unificada de Transacoes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir corrigir lancamentos financeiros na pagina Transacoes, preservando a consistencia de vendas, estoque e consumos de decant.

**Architecture:** Transacoes passa a despachar a acao pelo campo `origem`: CRUD direto e protegido para registros manuais, e modais de dominio para vendas e decants. A persistencia de venda e decant fica em RPCs Postgres atomicas; o navegador nunca tenta sincronizar estoque, itens, custos e caixa com varias escritas independentes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Supabase JS, PostgreSQL/PLpgSQL, Python unittest.

## Global Constraints

- Usar `formatBRL()` para toda exibicao monetaria; manter os valores no banco como `numeric`.
- Usar RPCs para qualquer alteracao que toque estoque, frascos, decants ou mais de uma tabela.
- Manter os arquivos em TypeScript/Python e imports pelo alias `@/` no frontend.
- Acoes iconicas precisam de `aria-label` e `title`; a tabela deve continuar rolavel horizontalmente em 360px.
- Transacoes `origem = 'venda'` e `origem = 'decant'` nunca podem receber `UPDATE` ou `DELETE` direto do browser.
- Nao alterar nem preparar commit para os arquivos backend ja modificados fora desta feature.

---

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/20260713_correcao_unificada_transacoes.sql` | FK de decant, RPC `editar_venda`, registro de consumo com vinculo e RPC `corrigir_consumo_decant`. |
| `backend/tests/test_correcao_transacoes_migration.py` | Garante que a migration versionada contem as guardas e RPCs obrigatorias. |
| `frontend/src/pages/estoque/vendas/VendaFormModal.tsx` | Formulario unico nos modos criar/editar, carregamento de dados e chamada da RPC adequada. |
| `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx` | Adaptador fino que abre `VendaFormModal` em modo de criacao. |
| `frontend/src/pages/estoque/vendas/EditarVendaModal.tsx` | Adaptador fino que abre `VendaFormModal` em modo de correcao. |
| `frontend/src/pages/estoque/decants/CorrigirConsumoDecantModal.tsx` | Corrige ou estorna consumo de decant, inclusive a vinculacao unica de registros legados. |
| `frontend/src/pages/financeiro/Transacoes.tsx` | Renderiza a coluna de acoes, o CRUD manual e os modais por origem. |
| `frontend/src/pages/estoque/Vendas.tsx` | Abre o mesmo editor de venda na lista operacional. |
| `frontend/src/pages/financeiro/__tests__/Transacoes.test.tsx` | Regressao do despacho por origem, edicao/exclusao manual e erros visiveis. |
| `frontend/src/pages/estoque/vendas/__tests__/VendaFormModal.test.tsx` | Regressao de pre-preenchimento e payload `editar_venda`. |
| `frontend/src/pages/estoque/decants/__tests__/CorrigirConsumoDecantModal.test.tsx` | Regressao de consumo vinculado, legado e erro de RPC. |
| `frontend/src/pages/estoque/__tests__/Vendas.test.tsx` | Regressao do ponto de entrada de edicao na lista de vendas. |
| `docs/HANDOFF_IA.md` e `docs/LOGS.md` | Estado, migration manual e verificacao final da sessao. |

## Task 1: Persistencia atomica e migration versionada

**Files:**
- Create: `supabase/migrations/20260713_correcao_unificada_transacoes.sql`
- Create: `backend/tests/test_correcao_transacoes_migration.py`

**Interfaces:**
- Consumes: `cancelar_venda(p_venda_id uuid)`, `registrar_venda(...)` e `registrar_consumo_decant(...)` das migrations existentes.
- Produces: `editar_venda(p_venda_id uuid, p_canal_id uuid, p_data_venda date, p_forma_pagamento text, p_cliente text, p_taxa_total numeric, p_frete numeric, p_responsavel text, p_observacao text, p_itens jsonb) returns jsonb`.
- Produces: `corrigir_consumo_decant(p_transacao_id uuid, p_decant_id uuid, p_ml int, p_classificacao text, p_custo_embalagem numeric, p_responsavel text) returns jsonb`.

- [ ] **Step 1: Escrever o teste de migration que falha**

```python
from pathlib import Path
import unittest


class CorrecaoTransacoesMigrationTest(unittest.TestCase):
    def test_migration_define_vinculo_e_rpcs_atomicas(self):
        root = Path(__file__).resolve().parents[2]
        migrations = list((root / 'supabase' / 'migrations').glob('*_correcao_unificada_transacoes.sql'))
        self.assertEqual(len(migrations), 1)

        sql = migrations[0].read_text(encoding='utf-8').lower()
        for trecho in (
            'add column if not exists decant_id uuid references decants(id)',
            'create or replace function editar_venda',
            'create or replace function corrigir_consumo_decant',
            "v_venda.status = 'cancelada'",
            "origem = 'venda'",
            "origem = 'decant'",
            'for update',
            'perform cancelar_venda(p_venda_id)',
        ):
            self.assertIn(trecho, sql)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Executar o teste e confirmar a falha inicial**

Run: `cd C:\Horus && .\.venv\Scripts\python.exe -m unittest backend/tests/test_correcao_transacoes_migration.py -v`

Expected: FAIL porque a migration ainda nao existe.

- [ ] **Step 3: Criar a migration com guardas e links de dominio**

Criar a migration com esta ordem obrigatoria:

```sql
alter table transacoes
  add column if not exists decant_id uuid references decants(id);

create index if not exists idx_transacoes_decant_id
  on transacoes(decant_id)
  where decant_id is not null;
```

Recriar `registrar_consumo_decant` a partir da funcao de
`20260617_consumo_decant.sql`, declarando `v_transacao_id uuid` e trocando o
insert final por:

```sql
insert into transacoes (
  descricao, tipo, valor, categoria, responsavel, origem, decant_id
)
values (
  v_label || ' - ' || p_ml || 'ml ' || v_produto.nome,
  'saida', v_custo_total, v_label, p_responsavel, 'decant', v_decant_id
)
returning id into v_transacao_id;
```

Declarar `editar_venda` com os mesmos parametros de `registrar_venda`, mais
`p_venda_id`. A primeira parte da funcao deve preservar a identidade da venda
e usar o estorno existente dentro da mesma transacao:

```sql
select * into v_venda from vendas where id = p_venda_id for update;
if not found then raise exception 'Venda nao encontrada'; end if;
if v_venda.status = 'cancelada' then raise exception 'Venda cancelada nao pode ser corrigida'; end if;
if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Venda sem itens'; end if;
if coalesce(p_taxa_total, 0) < 0 or coalesce(p_frete, 0) < 0 then
  raise exception 'Taxa e frete nao podem ser negativos';
end if;

perform cancelar_venda(p_venda_id);
delete from venda_itens where venda_id = p_venda_id;
update vendas set
  canal_id = p_canal_id,
  data_venda = coalesce(p_data_venda, current_date),
  forma_pagamento = p_forma_pagamento,
  cliente = p_cliente,
  taxa_total = coalesce(p_taxa_total, 0),
  frete = coalesce(p_frete, 0),
  responsavel = p_responsavel,
  observacao = p_observacao,
  total_bruto = 0,
  total_custo = 0,
  lucro_bruto = 0,
  status = 'concluida'
where id = p_venda_id
returning * into v_venda;
```

Depois do bloco acima, copiar a passagem de itens e o rateio de
`registrar_venda`, mas inserir `venda_itens` com `v_venda.id`, registrar
movimentos com `Venda #` mais `v_venda.numero`, e inserir as tres transacoes
usando esse mesmo ID. A funcao retorna `jsonb_build_object('id', v_venda.id,
'numero', v_venda.numero)`. O erro de estoque/ml insuficiente e qualquer erro
no bloco devem propagar: PL/pgSQL faz rollback de `cancelar_venda`, do update,
dos itens, do estoque e do caixa juntos.

Declarar `corrigir_consumo_decant` com os seguintes controles antes de alterar
dados:

```sql
select * into v_transacao from transacoes
where id = p_transacao_id and origem = 'decant' for update;
if not found then raise exception 'Transacao de decant nao encontrada'; end if;

if v_transacao.decant_id is not null and v_transacao.decant_id <> p_decant_id then
  raise exception 'O consumo informado nao corresponde a esta transacao';
end if;

select d.*, f.id as frasco_id, f.ml_total, f.ml_restante, p.custo_medio
into v_decant, v_frasco, v_produto
from decants d
join frascos_abertos f on f.id = d.frasco_id
join produtos p on p.id = d.produto_id
where d.id = p_decant_id and d.classificacao is not null
for update;
if not found then raise exception 'Consumo de decant nao encontrado'; end if;
```

Em seguida, devolver `v_decant.ml` ao frasco, marcar o frasco ativo, calcular o
novo custo com `p_ml`, `v_produto.custo_medio` e `v_frasco.ml_total`, e retirar
o novo ml. Se o novo custo for positivo, atualizar a mesma transacao com nova
descricao, categoria, valor, responsavel e `decant_id`; se for zero, apagar a
transacao depois de remover seu link. Apagar o antigo `decants` e inserir o
novo apenas apos validar classificacao, ml e saldo. Para registro legado, a
primeira chamada aceita `v_transacao.decant_id is null`, usa o `p_decant_id`
escolhido no modal e grava o vinculo durante a atualizacao atomica.

- [ ] **Step 4: Executar o teste de migration e inspecionar o diff**

Run: `cd C:\Horus && .\.venv\Scripts\python.exe -m unittest backend/tests/test_correcao_transacoes_migration.py -v`

Expected: PASS com `test_migration_define_vinculo_e_rpcs_atomicas`.

Run: `cd C:\Horus && git diff --check -- supabase/migrations/20260713_correcao_unificada_transacoes.sql backend/tests/test_correcao_transacoes_migration.py`

Expected: sem saida.

- [ ] **Step 5: Commitar a camada de banco isoladamente**

```bash
git add supabase/migrations/20260713_correcao_unificada_transacoes.sql backend/tests/test_correcao_transacoes_migration.py
git commit -m "feat: adiciona correcao atomica de transacoes"
```

## Task 2: Extrair o formulario de venda e suportar edicao

**Files:**
- Create: `frontend/src/pages/estoque/vendas/VendaFormModal.tsx`
- Create: `frontend/src/pages/estoque/vendas/EditarVendaModal.tsx`
- Modify: `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx`
- Create: `frontend/src/pages/estoque/vendas/__tests__/VendaFormModal.test.tsx`

**Interfaces:**
- Consumes: `editar_venda` e `registrar_venda` da Task 1.
- Produces: `VendaParaEditar` e `EditarVendaModal`, ambos importaveis por `Vendas.tsx` e `Transacoes.tsx`.

- [ ] **Step 1: Escrever os testes de formulario que falham**

```tsx
it('preenche a venda existente e envia editar_venda ao salvar', async () => {
  render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix'))
  fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'Cartao' } })
  fireEvent.click(screen.getByRole('button', { name: /salvar alteracoes/i }))

  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
    'editar_venda',
    expect.objectContaining({ p_venda_id: 'v1', p_forma_pagamento: 'Cartao' }),
  ))
})

it('mantem o formulario aberto e mostra o erro da rpc', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ error: { message: 'Estoque insuficiente' } } as never)
  render(<EditarVendaModal open vendaId="v1" onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByRole('button', { name: /salvar alteracoes/i })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /salvar alteracoes/i }))

  expect(await screen.findByText('Estoque insuficiente')).toBeInTheDocument()
  expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('Pix')
})
```

Mockar a cadeia de Supabase para retornar canais, produtos, frascos, embalagens,
o cabecalho de `v1` e seus `venda_itens`. O fixture de edicao deve conter um
item produto e um item decant para provar que o modo de edicao preserva ambos.

- [ ] **Step 2: Executar os testes e confirmar a falha inicial**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/vendas/__tests__/VendaFormModal.test.tsx`

Expected: FAIL porque `EditarVendaModal` ainda nao existe.

- [ ] **Step 3: Implementar o formulario unico com modos create e edit**

Mover a logica e o JSX de `NovaVendaModal` para `VendaFormModal.tsx`. Exportar
estes tipos e props:

```ts
export interface VendaParaEditar {
  id: string
  numero: number
  canal_id: string
  data_venda: string
  forma_pagamento: string | null
  cliente: string | null
  taxa_total: number
  frete: number
  responsavel: string | null
  observacao: string | null
}

export interface VendaFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  vendaId?: string
  onClose: () => void
  onSaved: () => void
}
```

No `useEffect`, quando `mode === 'edit'`, buscar o cabecalho e os itens por
`vendaId`, pre-preencher as linhas e carregar todos os frascos ativos mais os
frascos referenciados pelos itens atuais. Isso permite abrir uma venda que
esgotou um frasco antes de a RPC devolver o ml durante o estorno. No modo
criar, preservar o reset e o filtro de frascos ativos atuais.

Acrescentar os campos `Responsavel` e `Observacao` ao formulario e incluir
`p_responsavel` e `p_observacao` no payload. O submit deve escolher a RPC sem
duplicar validacao:

```ts
const rpc = mode === 'edit' ? 'editar_venda' : 'registrar_venda'
const args = {
  ...(mode === 'edit' ? { p_venda_id: vendaId } : {}),
  p_canal_id: canalId,
  p_data_venda: dataVenda || null,
  p_forma_pagamento: formaPagamento || null,
  p_cliente: cliente || null,
  p_taxa_total: Number(taxa) || 0,
  p_frete: Number(frete) || 0,
  p_responsavel: responsavel || user?.email || null,
  p_observacao: observacao || null,
  p_itens: itens,
}
const { error } = await supabase.rpc(rpc, args)
```

Usar `NovaVendaModal` apenas como adaptador:

```tsx
export function NovaVendaModal(props: Omit<VendaFormModalProps, 'mode'>) {
  return <VendaFormModal {...props} mode="create" />
}
```

Criar `EditarVendaModal` com os props `open`, `vendaId`, `onClose` e
`onSaved`, encaminhando `mode="edit"`. O titulo e botao devem alternar para
`Editar venda #N` e `Salvar alteracoes` no modo edit.

- [ ] **Step 4: Executar a suite focada e o typecheck**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/vendas/__tests__/VendaFormModal.test.tsx`

Expected: PASS com os dois cenarios de edicao.

Run: `cd C:\Horus\frontend && npm run build`

Expected: `tsc -b` e `vite build` concluem sem erros.

- [ ] **Step 5: Commitar o formulario reutilizavel**

```bash
git add frontend/src/pages/estoque/vendas/VendaFormModal.tsx frontend/src/pages/estoque/vendas/NovaVendaModal.tsx frontend/src/pages/estoque/vendas/EditarVendaModal.tsx frontend/src/pages/estoque/vendas/__tests__/VendaFormModal.test.tsx
git commit -m "feat: permite editar vendas em modal reutilizavel"
```

## Task 3: Expor a correcao compartilhada na lista de vendas

**Files:**
- Modify: `frontend/src/pages/estoque/Vendas.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`

**Interfaces:**
- Consumes: `EditarVendaModal` da Task 2, com `vendaId: string`.
- Produces: ponto de entrada de edicao que pode ser validado sem duplicar o formulario.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
it('abre o editor compartilhado para uma venda concluida', async () => {
  render(<MemoryRouter><EstVendas /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('Shopee')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: /editar venda #1/i }))

  expect(screen.getByTestId('editar-venda-modal')).toHaveAttribute('data-venda-id', 'v1')
})
```

Mockar `EditarVendaModal` para renderizar o `data-testid`; manter a venda
cancelada no fixture e verificar que ela nao recebe botao de editar.

- [ ] **Step 2: Executar o teste e confirmar a falha inicial**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/__tests__/Vendas.test.tsx`

Expected: FAIL porque a lista ainda mostra apenas `Cancelar`.

- [ ] **Step 3: Adicionar a acao e o modal na lista**

Adicionar `const [editando, setEditando] = useState<VendaRow | null>(null)`.
Na coluna final de uma venda `concluida`, renderizar botoes separados com
rotulos acessiveis:

```tsx
<Button size="sm" variant="ghost" aria-label={`Editar venda #${v.numero}`} onClick={() => setEditando(v)}>
  <Icon name="edit" size={14} />
</Button>
<Button size="sm" variant="ghost" onClick={() => setCancelando(v)}>
  Cancelar
</Button>
```

Ao lado de `NovaVendaModal`, montar:

```tsx
<EditarVendaModal
  open={!!editando}
  vendaId={editando?.id ?? ''}
  onClose={() => setEditando(null)}
  onSaved={() => { setEditando(null); fetchData() }}
/>
```

O `stopPropagation()` ja existente na celula permanece para que editar nao
abra o modal de detalhe da linha.

- [ ] **Step 4: Executar teste e build**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/__tests__/Vendas.test.tsx`

Expected: PASS, incluindo a nova cobertura de edicao.

Run: `cd C:\Horus\frontend && npm run build`

Expected: build concluido sem erros.

- [ ] **Step 5: Commitar o ponto de entrada operacional**

```bash
git add frontend/src/pages/estoque/Vendas.tsx frontend/src/pages/estoque/__tests__/Vendas.test.tsx
git commit -m "feat: abre correcao de venda pela lista"
```

## Task 4: Criar o modal de correcao de consumo de decant

**Files:**
- Create: `frontend/src/pages/estoque/decants/CorrigirConsumoDecantModal.tsx`
- Create: `frontend/src/pages/estoque/decants/__tests__/CorrigirConsumoDecantModal.test.tsx`

**Interfaces:**
- Consumes: `corrigir_consumo_decant` da Task 1.
- Produces: `CorrigirConsumoDecantModal({ open, transacao, onClose, onSaved })` para a pagina de Transacoes.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
it('preenche o consumo vinculado e chama a rpc de correcao apos confirmar', async () => {
  render(<CorrigirConsumoDecantModal open transacao={transacaoVinculada} onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByLabelText('Classificacao')).toHaveValue('amostra'))
  fireEvent.change(screen.getByLabelText('Quantidade (ml)'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: /salvar correcao/i }))
  fireEvent.click(screen.getByRole('button', { name: /confirmar correcao/i }))

  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith(
    'corrigir_consumo_decant',
    expect.objectContaining({ p_transacao_id: 't-decant', p_decant_id: 'd1', p_ml: 10 }),
  ))
})

it('exige escolher o consumo para uma transacao legada', async () => {
  render(<CorrigirConsumoDecantModal open transacao={transacaoLegada} onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByText(/selecione o consumo original/i)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /salvar correcao/i })).toBeDisabled()
})
```

Usar um fixture com `decant_id: 'd1'` e outro com `decant_id: null`. Mockar a
consulta de `decants` para retornar `id`, `ml`, `classificacao`, `custo`,
`custo_embalagem`, `created_at`, `frascos_abertos(ml_total, produtos(nome,
custo_medio))`.

- [ ] **Step 2: Executar os testes e confirmar a falha inicial**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/decants/__tests__/CorrigirConsumoDecantModal.test.tsx`

Expected: FAIL porque o componente ainda nao existe.

- [ ] **Step 3: Implementar formulario e confirmacao destrutiva**

Exportar um tipo minimo para a linha financeira:

```ts
export interface TransacaoDecantParaCorrigir {
  id: string
  descricao: string
  valor: number
  responsavel: string | null
  decant_id: string | null
}
```

Ao abrir, carregar apenas consumos nao faturaveis:

```ts
supabase
  .from('decants')
  .select('id, ml, classificacao, custo, custo_embalagem, created_at, frasco_id, frascos_abertos(ml_total, produtos(nome, custo_medio))')
  .not('classificacao', 'is', null)
  .order('created_at', { ascending: false })
```

Quando `transacao.decant_id` existir, selecionar e pre-preencher esse consumo.
Quando for `null`, exibir a mensagem `Selecione o consumo original para
vincular este lancamento historico.` e manter salvar desabilitado ate o usuario
escolher um item. Incluir classificacao, quantidade de ml e custo de embalagem
como campos editaveis. O botao `Salvar correcao` abre um segundo estado de
confirmacao que explica que o ml e o custo serao recalculados; somente
`Confirmar correcao` chama:

```ts
await supabase.rpc('corrigir_consumo_decant', {
  p_transacao_id: transacao.id,
  p_decant_id: decantId,
  p_ml: Number(ml),
  p_classificacao: classificacao,
  p_custo_embalagem: classificacao === 'perda' ? 0 : Number(custoEmbalagem) || 0,
  p_responsavel: responsavel || user?.email || null,
})
```

No erro, fechar somente a confirmacao secundaria, manter os campos e renderizar
`error.message` no modal principal. No sucesso, chamar `onSaved()` e
`onClose()`.

- [ ] **Step 4: Executar a suite focada e o typecheck**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/estoque/decants/__tests__/CorrigirConsumoDecantModal.test.tsx`

Expected: PASS para consumo vinculado, legado e falha de RPC.

Run: `cd C:\Horus\frontend && npm run build`

Expected: build concluido sem erros.

- [ ] **Step 5: Commitar o modal de decant**

```bash
git add frontend/src/pages/estoque/decants/CorrigirConsumoDecantModal.tsx frontend/src/pages/estoque/decants/__tests__/CorrigirConsumoDecantModal.test.tsx
git commit -m "feat: corrige consumos de decant vinculados"
```

## Task 5: Centralizar as acoes na pagina Transacoes

**Files:**
- Modify: `frontend/src/pages/financeiro/Transacoes.tsx`
- Create: `frontend/src/pages/financeiro/__tests__/Transacoes.test.tsx`

**Interfaces:**
- Consumes: `EditarVendaModal` da Task 2 e `CorrigirConsumoDecantModal` da Task 4.
- Produces: unico ponto visual de correcao dos lancamentos financeiros.

- [ ] **Step 1: Escrever os testes de despacho por origem e CRUD manual**

```tsx
it('edita uma transacao manual sem abrir editor de venda', async () => {
  render(<FinTransacoes />)
  await waitFor(() => expect(screen.getByText('Compra de insumos')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: /editar transacao compra de insumos/i }))
  fireEvent.change(screen.getByLabelText('Descricao'), { target: { value: 'Compra corrigida' } })
  fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

  await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'Compra corrigida' })))
  expect(updateEq).toHaveBeenCalledWith('origem', 'manual')
})

it('pede confirmacao antes de excluir transacao manual', async () => {
  render(<FinTransacoes />)
  await waitFor(() => expect(screen.getByText('Compra de insumos')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: /excluir transacao compra de insumos/i }))
  expect(screen.getByText(/esta acao nao pode ser desfeita/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))

  await waitFor(() => expect(deleteEq).toHaveBeenCalledWith('origem', 'manual'))
})

it('abre o editor de venda a partir de uma linha automatica', async () => {
  render(<FinTransacoes />)
  await waitFor(() => expect(screen.getByText('Venda #18')).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: /corrigir venda #18/i }))

  expect(screen.getByTestId('editar-venda-modal')).toHaveAttribute('data-venda-id', 'v18')
})
```

Adicionar um quarto teste com `origem: 'decant'` que verifica a abertura do
modal mockado. O mock de Supabase deve expor cadeias independentes para
`select().order()`, `update().eq().eq()`, `delete().eq().eq()` e os dados de
uma linha manual, uma venda com `venda_id` e um decant com `decant_id`.

- [ ] **Step 2: Executar os testes e confirmar a falha inicial**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/financeiro/__tests__/Transacoes.test.tsx`

Expected: FAIL porque a tabela ainda nao possui coluna de acoes nem modais de correcao.

- [ ] **Step 3: Implementar os estados, acoes e guardas manuais**

Estender `Transacao` com `venda_id?: string | null` e `decant_id?: string |
null`. Adicionar a coluna `Acoes`, atualizar todos os `colSpan` para 7 e criar
estados para `editandoManual`, `excluindoManual`, `editandoVendaId` e
`corrigindoDecant`.

Para cada acao, usar botoes apenas com icone, rotulo acessivel e tooltip:

```tsx
<Button size="sm" variant="ghost" aria-label={`Editar transacao ${t.descricao}`} title="Editar transacao">
  <Icon name="edit" size={14} />
</Button>
<Button size="sm" variant="ghost" aria-label={`Excluir transacao ${t.descricao}`} title="Excluir transacao">
  <Icon name="trash" size={14} />
</Button>
```

Para `manual`, o formulario de criacao deve receber os dados da linha e fazer:

```ts
const { error } = await supabase
  .from('transacoes')
  .update(payload)
  .eq('id', editandoManual.id)
  .eq('origem', 'manual')
```

O modal de exclusao deve chamar:

```ts
const { error } = await supabase
  .from('transacoes')
  .delete()
  .eq('id', excluindoManual.id)
  .eq('origem', 'manual')
```

Para `venda`, abrir `EditarVendaModal` com `vendaId={t.venda_id}`. O texto do
rotulo deve usar `Venda #N` quando presente na descricao e `Corrigir venda`
nos demais casos. Para `decant`, abrir `CorrigirConsumoDecantModal`. Nenhuma
acao de `update` ou `delete` pode ser renderizada para essas duas origens.

Cada sucesso deve fechar somente seu modal e executar `fetchData()`. Cada erro
de CRUD manual deve ficar no modal ativo, sem limpar o formulario ou fechar a
confirmacao.

- [ ] **Step 4: Executar os testes focados, a suite completa e o build**

Run: `cd C:\Horus\frontend && npm run test:run -- src/pages/financeiro/__tests__/Transacoes.test.tsx`

Expected: PASS com as quatro origens/acoes cobertas.

Run: `cd C:\Horus\frontend && npm run test:run`

Expected: todos os testes Vitest passam.

Run: `cd C:\Horus\frontend && npm run build`

Expected: `tsc -b` e `vite build` passam.

- [ ] **Step 5: Commitar a centralizacao visual**

```bash
git add frontend/src/pages/financeiro/Transacoes.tsx frontend/src/pages/financeiro/__tests__/Transacoes.test.tsx
git commit -m "feat: centraliza correcao na pagina de transacoes"
```

## Task 6: Documentar, validar a migration e fechar a feature

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

**Interfaces:**
- Consumes: migrations e verificacoes completas das Tasks 1-5.
- Produces: contexto suficiente para aplicar a migration manualmente e retomar a sessao.

- [ ] **Step 1: Aplicar a migration no Supabase SQL Editor antes do smoke test**

Abrir `supabase/migrations/20260713_correcao_unificada_transacoes.sql` no SQL
Editor do projeto `wyobbztexoofhqdttxzq`, executar o script inteiro e confirmar
que o editor nao retorna erro. Esta etapa e obrigatoria antes de testar no
navegador, pois o frontend chama as duas novas RPCs.

- [ ] **Step 2: Executar a regressao backend e frontend**

Run: `cd C:\Horus && .\.venv\Scripts\python.exe -m unittest discover -s backend/tests -p "test_*.py" -v`

Expected: todos os testes backend passam, incluindo
`test_correcao_transacoes_migration`.

Run: `cd C:\Horus\frontend && npm run test:run && npm run build`

Expected: suite Vitest e build passam.

- [ ] **Step 3: Executar smoke test manual com dados de teste**

1. Em `Financeiro > Transacoes`, criar uma saida manual, editar descricao e
   valor, confirmar exclusao e verificar que a linha desaparece.
2. Registrar uma venda de produto com Pix, abrir a linha `Venda #N` em
   Transacoes, mudar para Cartao e alterar o preco; verificar atualizacao da
   receita, taxa/frete se existirem e do dashboard de vendas.
3. Editar a mesma venda para trocar um item por outro com estoque disponivel;
   verificar que as quantidades de ambos produtos e o lucro foram recalculados.
4. Registrar um consumo de decant, corrigi-lo em Transacoes e verificar o ml,
   classificacao e despesa resultantes.
5. Tentar uma correcao de venda acima do estoque disponivel; verificar mensagem
   de erro e que venda, estoque e transacoes anteriores permaneceram iguais.

- [ ] **Step 4: Atualizar a documentacao viva**

Adicionar ao Handoff uma entrada com data, migration aplicada, modais por
origem, limites das transacoes automaticas e contagens reais de testes. Em
`docs/LOGS.md`, registrar os mesmos resultados, o commit final e a conclusao
do smoke test. Atualizar `docs/features/FINANCEIRO.md` para substituir o CRUD
generico por regras por origem e apontar para a correcao de venda/decant.

- [ ] **Step 5: Commitar a documentacao final**

```bash
git add docs/HANDOFF_IA.md docs/LOGS.md docs/features/FINANCEIRO.md
git commit -m "docs: registra correcao unificada de transacoes"
```

## Self-Review

- Cobertura da especificacao: Task 1 cobre persistencia atomica e vinculo de
  decant; Tasks 2-3 cobrem o editor reutilizavel de venda; Task 4 cobre consumo
  e legados; Task 5 cobre a experiencia centralizada e CRUD manual; Task 6
  cobre migration, verificacao e documentacao exigida pelo projeto.
- Sem placeholders: todas as etapas informam arquivos, interfaces, comandos e
  comportamento esperado.
- Consistencia: `editar_venda`, `corrigir_consumo_decant`,
  `EditarVendaModal` e `CorrigirConsumoDecantModal` mantem os mesmos nomes e
  assinaturas do inicio ao fim do plano.
