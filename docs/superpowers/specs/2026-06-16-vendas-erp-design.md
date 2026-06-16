# Módulo de Vendas — Integração Estoque ↔ Financeiro (ERP)

> Spec de design — 2026-06-16. Produto: Horus Parfum Control.

## Objetivo

Criar um módulo de **Vendas** que registra a venda de perfumes (frascos cheios) e de
decants, vinculando cada venda **simultaneamente ao estoque** (baixa de unidades / ml) e
ao **financeiro** (receita + taxas no caixa), e **armazenando** custo, lucro, ROI e margem
por venda e por item. Esses dados são a fundação para futuros dashboards de análise.

O financeiro mantém sua parte **manual** (compra de insumos, infraestrutura, etc.) e ganha
uma camada **automática** alimentada pelas vendas.

## Contexto e estado atual

- `transacoes` hoje é **100% manual**, sem vínculo com produtos (`tipo` entrada/saida,
  `valor`, `categoria`, `forma_pagamento`). O dashboard financeiro (`lib/financeiro.ts`)
  lê essa tabela.
- `produtos` já possui `custo_medio` e `ultimo_custo` (atualizados na confirmação de
  pedidos) — base de custo pronta para snapshot.
- Estoque de frascos cheios em `produtos.estoque_atual`; saídas via RPC `registrar_saida`
  e ledger `movimentacoes`.
- Decants: `frascos_abertos` (ml_total/ml_restante/status) e `decants` (ml retirados).
  Um decant é uma **retirada de ml** de um frasco aberto. Não há "estoque de decants
  prontos".
- **PRD Regra #1** declara hoje: "Financeiro e Estoque não têm vínculo direto entre si".
  **Este design inverte essa regra** (via Vendas) e ajusta o item de "fora de escopo:
  vendas pelo sistema".
- Padrões existentes a reaproveitar: RPCs atômicas (`confirmar_recebimento`,
  `registrar_saida`), `NovoPedidoModal` (editor multi-item com cadastro rápido),
  libs puras com decimal.js (`lib/financeiro.ts`, `lib/estoque.ts`).

## Decisões (travadas no brainstorming)

1. **Canais** são uma entidade gerenciável com **taxa padrão %** editável; a taxa
   pré-preenche o formulário mas é **sobrescrita por venda** (taxa real varia por método
   de pagamento, promoção, etc.).
2. **Custo do decant** = `ml × (custo_medio ÷ volume_ml)` + **insumo de embalagem**
   (cadastrado por tamanho, editável).
3. **Venda → caixa**: gera automaticamente **receita (bruto)** + **taxa (despesa)**
   [+ frete, se houver], vinculadas à venda. Lucro/ROI gerencial vive no módulo de Vendas.
   O custo do produto **não** é relançado no caixa (já foi despesa na compra do estoque),
   evitando dupla contagem.
4. **Decant é sob demanda**: vender um decant tira o ml do frasco **e** registra a venda
   numa única ação atômica.
5. **Preço de referência**: um único `preco_referencia` por produto (controle), que
   pré-preenche e é editável na venda.
6. **Estrutura da venda**: cabeçalho + itens (`vendas` + `venda_itens`). Um pedido pode ter
   vários itens (produtos e/ou decants); taxa e frete são do pedido e **rateados
   proporcionalmente** ao bruto de cada item para o ROI por item.
7. **Correção de venda**: via **cancelar + recriar** no v1 (estorno completo). Edição inline
   é melhoria futura.

## Arquitetura

Três camadas com responsabilidades separadas, costuradas por uma RPC atômica:

- **Gerencial (Vendas)** — novas tabelas `vendas`/`venda_itens`. Detalhe completo com custo
  snapshot e lucro/ROI. Fonte dos futuros dashboards.
- **Caixa (Financeiro)** — `transacoes` existente. A venda injeta as linhas de dinheiro real.
  O dashboard financeiro não muda — as vendas entram automaticamente.
- **Estoque** — baixa na mesma ação (produto → `estoque_atual`; decant → ml do frasco),
  reaproveitando `movimentacoes` e `decants`.

**Atomicidade:** a RPC `registrar_venda` faz baixa de estoque + venda + lançamentos de caixa
em uma transação. Qualquer falha (ex.: estoque insuficiente) faz rollback total — estoque e
financeiro nunca dessincronizam. Mesmo padrão de `confirmar_recebimento`.

**Snapshot de custo:** no momento da venda, copiamos o `custo_medio` atual do produto para o
item vendido. Mudanças futuras de custo não alteram o lucro/ROI de vendas históricas.

## Modelo de dados

### Tabelas novas

**`canais`**
| campo | tipo | nota |
|---|---|---|
| id | uuid PK | |
| nome | text | Loja física, Shopee, Mercado Livre, Site, Instagram/WhatsApp… |
| taxa_padrao | numeric(5,2) | % sugerida (loja física = 0) |
| ativo | boolean default true | |
| created_at | timestamptz default now() | |

**`vendas`** (cabeçalho)
| campo | tipo | nota |
|---|---|---|
| id | uuid PK | |
| numero | serial unique | nº sequencial |
| canal_id | uuid FK → canais | |
| data_venda | date default current_date | data real da venda |
| forma_pagamento | text | |
| cliente | text null | opcional |
| taxa_total | numeric(12,2) default 0 | taxa do pedido (pré-preenchida, editável; ≥ 0) |
| frete | numeric(12,2) default 0 | frete absorvido pelo vendedor (custo); ≥ 0 |
| total_bruto | numeric(12,2) | gravado pela RPC |
| total_custo | numeric(12,2) | gravado pela RPC |
| lucro_bruto | numeric(12,2) | gravado pela RPC |
| responsavel | text null | |
| observacao | text null | |
| status | text default 'concluida' | 'concluida' \| 'cancelada' |
| created_at | timestamptz default now() | |

**`venda_itens`** (linhas)
| campo | tipo | nota |
|---|---|---|
| id | uuid PK | |
| venda_id | uuid FK → vendas (cascade) | |
| tipo | text | 'produto' \| 'decant' |
| produto_id | uuid FK → produtos | |
| frasco_id | uuid FK → frascos_abertos null | só decant: de qual frasco saiu |
| ml | int null | só decant (> 0) |
| quantidade | int default 1 | > 0 |
| preco_unitario | numeric(12,2) | valor realmente vendido (≥ 0) |
| custo_unitario | numeric(12,2) | snapshot do custo unitário |
| custo_embalagem | numeric(12,2) default 0 | insumo do decant (0 p/ produto) |
| taxa_rateada | numeric(12,2) | taxa alocada ao item |
| frete_rateado | numeric(12,2) | frete alocado ao item |
| lucro | numeric(12,2) | lucro do item |

**`embalagens_decant`** (custo de insumo por tamanho)
| campo | tipo | nota |
|---|---|---|
| id | uuid PK | |
| tamanho_ml | int unique | 2, 5, 10… |
| custo | numeric(12,2) | frasco atomizador + etiqueta (≥ 0) |
| ativo | boolean default true | |

### Alterações em tabelas existentes

- **`produtos`**: adicionar `preco_referencia numeric(12,2)` null — preço de controle que
  pré-preenche a venda.
- **`transacoes`**: adicionar `venda_id uuid FK → vendas null` + `origem text default
  'manual'` ('manual' | 'venda'). Linhas geradas por venda entram com `origem='venda'` e
  `venda_id` preenchido; são **bloqueadas para edição manual** na UI.

### RLS

Mesma política das demais tabelas: `for all to authenticated using (true) with check (true)`
em `canais`, `vendas`, `venda_itens`, `embalagens_decant`.

## Fluxo de venda

1. **Nova venda**: escolhe canal (taxa padrão pré-preenche), forma de pagamento, data,
   cliente (opcional).
2. **Adiciona itens** (produtos e/ou decants no mesmo pedido):
   - **Produto**: busca produto → quantidade → `preco_unitario` vem de `preco_referencia`
     (editável); exibe estoque disponível.
   - **Decant**: escolhe um frasco aberto (produto com frasco ativo) → ml (2/5/10/custom) →
     `preco_unitario` digitado (preço de decant sempre varia) → `custo_embalagem`
     pré-preenchido pelo tamanho (editável).
3. `taxa_total` pré-preenche como `taxa_padrao% × total_bruto`, **sobrescrita** com a taxa
   real; `frete` opcional.
4. **Prévia ao vivo**: receita líquida, custo total, lucro, ROI, margem.
5. Confirma → RPC `registrar_venda` grava tudo atomicamente.

## Cálculos (`lib/vendas.ts`, puro, decimal.js)

- **Custo unitário (snapshot)** por tipo:
  - Produto: `custo_unitario = produtos.custo_medio`; `custo_embalagem = 0`.
  - Decant: `custo_unitario = ml × (custo_medio ÷ volume_ml)` (só o perfume);
    `custo_embalagem` vem da tabela por tamanho.
- **Custo do item** (fórmula única para os dois tipos) =
  `(custo_unitario + custo_embalagem) × quantidade`.
- Para decant com `quantidade > 1`, o ml baixado do frasco é `ml × quantidade`.
- **Rateio** de taxa e frete proporcional ao bruto do item:
  `taxa_rateada_i = taxa_total × (bruto_i ÷ total_bruto)`; idem `frete_rateado_i`.
  O **último item absorve a sobra de arredondamento** para que a soma das parcelas seja
  exatamente igual ao total (sem centavo perdido). Se `total_bruto = 0`, rateio é 0.
- **Lucro do item** = `bruto_i − taxa_rateada_i − frete_rateado_i − custo_i`.
- **Totais da venda**:
  - `total_bruto = Σ bruto_i`
  - `total_custo = Σ custo_i`
  - `receita_liquida = total_bruto − taxa_total − frete`
  - `lucro_bruto = receita_liquida − total_custo`
  - `ROI = lucro_bruto ÷ total_custo` (se `total_custo = 0`, ROI indefinido → exibir "—")
  - `margem = lucro_bruto ÷ total_bruto` (se `total_bruto = 0`, margem 0)

Funções puras: `custoDecant`, `ratearProporcional`, `lucroItem`, `resumoVenda`, `roi`,
`margem`.

## RPCs (SQL, security definer, atômicas)

**`registrar_venda(payload jsonb)`** — em uma transação:
1. Valida canal e itens (≥ 1 item, preços/quantidades válidos).
2. Para cada item:
   - **Produto**: valida `estoque_atual ≥ quantidade` (senão `raise` → rollback); baixa
     `estoque_atual`; insere `movimentacoes` tipo 'saida' (motivo "Venda #N",
     `saldo_resultante`); snapshot `custo_medio`.
   - **Decant**: valida frasco ativo e `ml_restante ≥ ml`; baixa `ml_restante`; insere
     `decants`; marca frasco 'esgotado' se zerar; calcula custo snapshot
     (`ml × custo_medio/ml_total + custo_embalagem`).
3. Calcula brutos, rateia `taxa_total` e `frete` proporcionalmente, calcula lucro por item e
   totais.
4. Insere `vendas` + `venda_itens`.
5. Insere `transacoes`: sempre a receita (`entrada`, `total_bruto`, categoria "Vendas");
   despesa de taxa **se `taxa_total > 0`** (`saida`, categoria "Taxas marketplace"); despesa
   de frete **se `frete > 0`** (`saida`, categoria "Frete") — assim loja física (taxa 0, sem
   frete) gera só a receita. Todas com `origem='venda'`, `venda_id`, descrição
   "Venda #N — <canal>".
6. Retorna id/numero da venda.

**`cancelar_venda(p_venda_id uuid)`** — estorno completo, em uma transação:
- Devolve estoque: produto → `estoque_atual += quantidade` + `movimentacoes` 'entrada'
  ("Estorno venda #N"); decant → `ml_restante += ml` (frasco volta a 'ativo' se estava
  esgotado), remove a linha `decants`.
- Apaga as `transacoes` com `origem='venda'` e aquele `venda_id`.
- Marca `vendas.status = 'cancelada'`.
- Bloqueia cancelar venda já cancelada.

## Telas (UI)

- **Vendas (lista)** — novo item de nav no grupo **Estoque**. Tabela: nº, data, canal,
  resumo dos itens, bruto, lucro, ROI, status; filtros por canal/período; botão "Nova venda";
  ação "Cancelar".
- **Nova venda** — modal grande no molde do `NovoPedidoModal` (editor de itens add/remove +
  cadastro rápido), com prévia ao vivo de lucro/ROI/margem.
- **Detalhe da venda** — itens, custos snapshot, lucro por item, linhas de caixa vinculadas.
- **Config Canais** — CRUD simples (nome, taxa padrão, ativo).
- **Config Embalagens de decant** — CRUD (tamanho → custo).
- **Produtos** — adicionar o campo `preco_referencia` ao formulário existente.
- **Transações** — linhas com `origem='venda'` exibidas **bloqueadas para edição**
  ("gerada pela venda #N").

## Tratamento de erros

- Estoque/ml insuficiente, frasco esgotado no meio do pedido → RPC aborta, **nada** é
  gravado; o front mostra o erro específico.
- Validação no front: venda sem itens, preço/quantidade inválidos, ml inválido.
- Cancelar venda já cancelada → erro/no-op.
- Transações `origem='venda'` protegidas de edição/exclusão manual na UI.

## Testes (TDD)

- **`lib/vendas.ts`** (unitários, decimal.js): `custoDecant`; `ratearProporcional` incluindo
  sobra de centavos e `total_bruto = 0`; `lucroItem`; `resumoVenda` (bruto/líquido/lucro/
  ROI/margem) cobrindo taxa 0, frete 0, item único, multi-item, decant+produto misturados;
  `roi` com custo 0; `margem` com bruto 0.
- **Componentes**: lista de vendas (render/estado vazio); modal de nova venda (adicionar/
  remover item, prévia atualiza); bloqueio de edição em Transações.
- **RPCs (SQL)**: validadas no Supabase e pelo fluxo (o projeto não tem unit test de plpgsql).

## Migração

Nova migração `supabase/migrations/20260616_vendas.sql` (ou data seguinte): tabelas novas,
alterações em `produtos`/`transacoes`, RLS, e as RPCs `registrar_venda` e `cancelar_venda`.
Seed inicial de `canais` (Loja física 0%, Shopee, Mercado Livre, Site, Instagram/WhatsApp) e
de `embalagens_decant` (2/5/10 ml). **Aplicar manualmente no Supabase SQL Editor.**

## Atualização de documentação

- **PRD**: inverter a Regra de Negócio #1 (agora há vínculo Estoque↔Financeiro via Vendas) e
  ajustar o item "fora de escopo: vendas pelo sistema" (passamos a registrar vendas; não é um
  PDV com captura de pagamento).
- **BANCO**: documentar as tabelas novas, alterações e RPCs.
- **HANDOFF/LOGS**: registrar a sessão.

## Escopo

**Dentro (v1):** vendas multi-item; canais com taxa editável; custo de decant com insumo;
integração automática caixa + estoque; cancelamento/estorno; preço de referência; config de
embalagens; lib pura com testes; **gerar e armazenar** lucro/ROI/margem.

**Fora (futuro):**
- Dashboards de ROI/análise (este design só produz os dados que eles consumirão).
- Edição inline de venda (v1 = cancelar + recriar).
- Estoque de decants pré-prontos.
- Regras automáticas de taxa por método de pagamento/promoção.
- Parcelamento / contas a receber a partir da venda.
- Devolução parcial.
