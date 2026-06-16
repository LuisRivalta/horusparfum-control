# Decants não-faturáveis — perda / brinde / amostra / marketing

> Spec de design — 2026-06-16. Produto: Horus Parfum Control.

## Objetivo

Separar dois usos do decant:
- **Página Vendas** → decant que **fatura** (receita + custo + ROI). Já implementado.
- **Página Decants** → decant que **só consome** produto, sem faturar: perda, brinde, amostra, marketing, uso interno. Cada um registra seu **custo** e uma **classificação**, gera controle gerencial por tipo, e lança uma **despesa no Financeiro**.

Mais: uma ação **"Esgotar frasco"** que transforma a sobra fantasma de um frasco numa **perda contabilizada**.

## Contexto e estado atual

- `frascos_abertos` (ml_total, ml_restante, status), `decants` (frasco_id, produto_id, ml, created_at) — hoje sem custo nem classificação.
- `DecantModal.tsx`: registra um decant (tira ml do frasco, insere em `decants`) via 2 passos client-side com rollback manual. Sem custo, sem motivo, sem nada financeiro.
- `Decants.tsx`: grid de frascos; clicar num frasco ativo abre o DecantModal; frascos esgotados podem ser excluídos.
- `embalagens_decant` (tamanho_ml → custo) e `lib/vendas.ts` (`custoDecantUnitario`) já existem (do módulo de Vendas) e serão reaproveitados.
- `transacoes.origem` hoje aceita `'manual' | 'venda'`.
- **Importante:** `confirmar_recebimento` (compra de estoque) **não** lança em `transacoes`. Logo, lançar o custo do decant no Financeiro só vira dupla contagem se o usuário também registrar a compra da garrafa manualmente no caixa — é uma escolha consciente do usuário (decidido: sempre lançar).

## Decisões (travadas no brainstorming)

1. **Classificações** (enum fixo): `perda`, `amostra`, `brinde`, `marketing`, `uso_interno`, `outro`.
2. **Sempre lança no Financeiro**: todo decant não-faturável gera uma despesa em `transacoes` com `categoria` = rótulo da classificação. Automático, sem opção de desligar.
3. **Custo = perfume + embalagem**, exceto **perda** (só perfume — perda não consome embalagem).
4. **"Esgotar frasco"** = registrar todo o ml restante como `perda` (custo só do perfume) e marcar o frasco como esgotado.
5. **Atomicidade**: a operação (baixa do frasco + insert do decant + despesa no caixa) roda numa **RPC** atômica, no padrão de `registrar_venda`.

## Modelo de dados

### Alterações em `decants`

```sql
alter table decants add column if not exists classificacao text
  check (classificacao in ('perda','amostra','brinde','marketing','uso_interno','outro'));
alter table decants add column if not exists custo numeric(12,2) not null default 0;
alter table decants add column if not exists custo_embalagem numeric(12,2) not null default 0;
```

- `classificacao` é **nullable** — linhas antigas (pré-feature) ficam `null` e são agrupadas como "Sem classificação" no relatório (ou ignoradas).
- `custo` = custo total do consumo (perfume + embalagem). `custo_embalagem` guardado à parte para detalhe.

### Alteração em `transacoes`

```sql
alter table transacoes drop constraint if exists transacoes_origem_check;
alter table transacoes add constraint transacoes_origem_check
  check (origem in ('manual','venda','decant'));
```

A despesa do decant entra com `origem='decant'`. Sem FK para `decants` — a rastreabilidade fica na `descricao` (ex: "Brinde — 5ml Asad Lattafa"). A despesa **persiste** mesmo se o frasco/decant for excluído depois (é um gasto real que aconteceu).

## RPC: `registrar_consumo_decant` (atômica)

```sql
create or replace function registrar_consumo_decant(
  p_frasco_id uuid,
  p_ml int,
  p_classificacao text,
  p_custo_embalagem numeric,
  p_responsavel text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_frasco frascos_abertos%rowtype;
  v_produto produtos%rowtype;
  v_custo_perfume numeric(12,2);
  v_custo_emb numeric(12,2);
  v_custo_total numeric(12,2);
  v_novo_ml int;
  v_decant_id uuid;
  v_categoria text;
  v_label text;
begin
  if p_classificacao not in ('perda','amostra','brinde','marketing','uso_interno','outro') then
    raise exception 'Classificação inválida';
  end if;
  if p_ml is null or p_ml <= 0 then raise exception 'ml inválido'; end if;

  select * into v_frasco from frascos_abertos where id = p_frasco_id for update;
  if not found then raise exception 'Frasco não encontrado'; end if;
  if v_frasco.status <> 'ativo' then raise exception 'Frasco não está ativo'; end if;
  if v_frasco.ml_restante < p_ml then
    raise exception 'ml insuficiente no frasco: % disponíveis', v_frasco.ml_restante;
  end if;

  select * into v_produto from produtos where id = v_frasco.produto_id for update;

  v_custo_perfume := round(p_ml * coalesce(v_produto.custo_medio, 0) / nullif(v_frasco.ml_total, 0), 2);
  -- perda não consome embalagem
  v_custo_emb := case when p_classificacao = 'perda' then 0 else coalesce(p_custo_embalagem, 0) end;
  v_custo_total := v_custo_perfume + v_custo_emb;

  v_novo_ml := v_frasco.ml_restante - p_ml;
  update frascos_abertos set
    ml_restante = v_novo_ml,
    status = case when v_novo_ml <= 0 then 'esgotado' else 'ativo' end
  where id = v_frasco.id;

  insert into decants (frasco_id, produto_id, ml, classificacao, custo, custo_embalagem)
  values (v_frasco.id, v_frasco.produto_id, p_ml, p_classificacao, v_custo_total, v_custo_emb)
  returning id into v_decant_id;

  v_label := case p_classificacao
    when 'perda' then 'Perda' when 'amostra' then 'Amostra' when 'brinde' then 'Brinde'
    when 'marketing' then 'Marketing' when 'uso_interno' then 'Uso interno' else 'Outro' end;

  -- só lança no caixa se houver custo (evita despesa R$0 e possível check de valor)
  if v_custo_total > 0 then
    insert into transacoes (descricao, tipo, valor, categoria, responsavel, origem)
    values (v_label || ' — ' || p_ml || 'ml ' || v_produto.nome, 'saida', v_custo_total,
            v_label, p_responsavel, 'decant');
  end if;

  return jsonb_build_object('id', v_decant_id, 'custo', v_custo_total, 'esgotado', v_novo_ml <= 0);
end;
$$;
```

Notas:
- Se `custo_total = 0` (ex: produto sem `custo_medio`), grava o decant mesmo assim (custo 0), mas **não** lança despesa no caixa (guarda `if v_custo_total > 0`). O relatório gerencial ainda conta o decant como custo 0.
- "Esgotar frasco" chama a mesma RPC: `registrar_consumo_decant(frasco_id, ml_restante, 'perda', 0, responsavel)`.

## Cálculo de custo (frontend, para a prévia)

Reaproveita `custoDecantUnitario(ml, custoMedio, volumeMl)` de `lib/vendas.ts`:

```
custo = custoDecantUnitario(ml, custo_medio, ml_total) + (classificacao === 'perda' ? 0 : custo_embalagem)
```

- `custo_embalagem` pré-preenche pelo `embalagens_decant` que casa com o `ml` do decant (igual ao NovaVendaModal), editável; ocultado/zerado quando `classificacao === 'perda'`.
- A RPC é a fonte da verdade; a prévia é estimativa (paridade com a RPC, mesma fórmula/arredondamento).

## Relatório de controle (`lib/decants.ts` + UI)

Função pura nova em `lib/decants.ts`:

```ts
export interface ConsumoDecant { classificacao: string | null; custo: number; created_at: string }
export interface FatiaConsumo { classificacao: string; label: string; total: number }
export function resumoConsumo(decants: ConsumoDecant[], inicio: Date, fim: Date): FatiaConsumo[]
```

- Filtra por período, agrupa por `classificacao`, soma `custo`, ordena desc. `null` → label "Sem classificação". Usa decimal.js. TDD.

**UI:** um card na página Decants mostrando o breakdown do mês corrente:

> **Consumo do mês:** Perdas R$ 32,50 · Amostras R$ 18,00 · Brindes R$ 12,50 · Marketing R$ 25,00

## Telas (UI)

- **DecantModal** (reformulado): além de escolher ml (rápido 2/5/10 ou custom), agora pede **classificação** (obrigatória) e mostra **custo de embalagem** (auto pelo ml, editável; oculto quando classificação = perda) + **prévia do custo total**. Ao confirmar, chama `registrar_consumo_decant` (substitui o insert manual de 2 passos). O título deixa claro que é consumo interno, não venda.
- **Decants page**:
  - Botão **"Esgotar frasco"** em cada frasco **ativo** (com confirmação leve) → chama a RPC com `perda` + ml_restante.
  - **Card de resumo** do consumo do mês (breakdown por classificação) no topo.
  - Precisa incluir `produtos(... , custo_medio)` na query dos frascos para a prévia de custo no modal.
- **Transações (Financeiro)**: o badge de origem passa a cobrir `origem='decant'` também (ex: badge "decant" ou o próprio rótulo). As linhas de decant aparecem como despesas com a categoria da classificação.

## Tratamento de erros

- ml > disponível, frasco inativo, classificação inválida → a RPC aborta, nada é gravado; o front mostra o erro.
- Validação no front: classificação obrigatória, ml > 0.
- "Esgotar frasco" só aparece em frasco ativo; confirmação antes de executar.

## Testes (TDD)

- `lib/decants.ts`: `resumoConsumo` — agrupamento por classificação, filtro de período, soma com decimal.js, tratamento de `null` (sem classificação), lista vazia.
- Componentes: DecantModal (classificação obrigatória; embalagem some quando perda; prévia de custo atualiza), card de resumo na página Decants.
- RPC validada no Supabase + pelo fluxo (sem unit test de plpgsql).

## Migração

`supabase/migrations/20260617_consumo_decant.sql`: colunas novas em `decants`, ajuste do check de `transacoes.origem`, RPC `registrar_consumo_decant`. **Aplicar manualmente no Supabase SQL Editor.**

## Documentação

- **BANCO**: documentar colunas novas de `decants`, o novo valor de `origem`, e a RPC.
- **PRD**: nota de que a página Decants é para consumo interno (não-faturável) e Vendas para faturável.
- **HANDOFF/LOGS**: registrar a sessão e a migração pendente.

## Escopo

**Dentro (v1):** classificação + custo (perfume + embalagem, exceto perda) em cada decant não-faturável; RPC atômica; despesa automática no Financeiro; "esgotar frasco"; card de resumo por classificação no mês; reaproveitar `custoDecantUnitario` e `embalagens_decant`.

**Fora (futuro):**
- Desfazer/estornar um decant não-faturável (operação é one-way no v1).
- Relatório histórico avançado (gráficos, múltiplos períodos) — só o card do mês por enquanto.
- Reclassificar/mover um decant já registrado.
- Tratar a dupla contagem contábil de forma automática (decidido: sempre lança, usuário concilia).
