# Shopify + núcleo de vendas dos canais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendas da Shopify entram sozinhas no Horus numa lista "a confirmar" que reserva estoque; a confirmação usa o registro de venda existente; o estoque do Horus é empurrado para a Shopify; produtos (perfume, creme...) são publicados na Shopify a partir do Horus.

**Architecture:** Núcleo neutro de canal no banco (`canal_vinculos`, `pedidos_canal`, fila de sincronização com gatilho `pg_net`) e no backend (`services/canais/`), com o conector Shopify em `services/shopify/` (Admin GraphQL + webhooks HMAC). A confirmação reaproveita o `VendaFormModal` (troca de perfume e abrir lacrado já existem nele) chamando uma RPC que trava o pedido e chama `registrar_venda`.

**Tech Stack:** FastAPI (Vercel serverless) + httpx; Supabase Postgres/PL-pgSQL + `pg_net`; React 19 + Vite + TS + Tailwind + vitest + decimal.js.

**Spec:** `docs/superpowers/specs/2026-11-18-shopify-canais-design.md` (e seções 4 e 7 de `docs/superpowers/specs/2026-11-16-anuncios-design.md`).

## Global Constraints

- Trabalhar direto na `main`, sem worktree; commit por tarefa; **sem push**; **nunca** a linha `Co-Authored-By` nos commits.
- SQL vai em `supabase/migrations/2026111810xxxx_*.sql` + check em `supabase/checks/`; **o Luis aplica à mão** no SQL Editor do projeto `wyobbztexoofhqdttxzq`. Nunca usar o MCP do Supabase (aponta para outro projeto).
- Segredos (Client secret, token Shopify, segredo da fila) só no backend / tabelas sem policy (RLS ligado, sem policy = só service role). Nada de segredo no frontend nem em chat.
- Todo `.py`/`.js`/`.ps1` criado ou modificado é registrado com `Registrar-Auditoria__Claude_Code_MS125_luisgfr.ps1` (`-Acao Criado|Modificado`, `-Origem Solicitado`, `-Razao`, `-Contexto`); módulos do projeto mantêm o nome. Falha no registro → avisar o Luis.
- EDR: nada de `python -c`, `python -`, heredoc para interpretador. Testes: `cd backend; .venv\Scripts\python -m pytest tests/<arquivo> -q`; frontend: `cd frontend; npx vitest run <arquivo>`; build: `npm run build` e **conferir o código de saída antes de commitar**.
- Dinheiro em `Decimal` (backend) / `decimal.js` (frontend); `formatBRL()` na tela; componentes de formulário de `components/shared/FormControls.tsx` (o `Select` próprio; nos testes, `escolher()` de `src/test/escolher.ts`).
- API da Shopify: Admin GraphQL, versão fixa `API_VERSAO = '2026-10'` em `services/shopify/cliente.py` **(conferir a versão estável vigente)**. Escopos do app: `read_products, write_products, read_inventory, write_inventory, read_locations, read_orders`.
- Canal: nome exato `'Shopify'` na tabela `canais`; no núcleo, o canal externo é o texto `'shopify'` (depois `'ml'`).
- Status de `pedidos_canal`: `aguardando_pagamento`, `a_confirmar`, `confirmado`, `cancelado`, `cancelado_pos_confirmacao`. Reservam: `aguardando_pagamento` e `a_confirmar`.
- **Frete na confirmação (decisão do plano, ajusta o spec 7.5):** o campo Frete do formulário vem **0** e o frete pago pelo cliente aparece ao lado como informação ("Cliente pagou R$ X de frete"). Motivo: em `registrar_venda` o frete é só despesa; pré-preencher com o valor pago pelo cliente baixaria o lucro sem a receita correspondente. Editável como no spec.
- Taxa na confirmação = `taxa_padrao` do canal Shopify (%), que o `VendaFormModal` já calcula quando a taxa está vazia.

## Review Focus

1. **Aviso repetido ou fora de ordem** (o `orders/updated` chega antes do `orders/create`, ou chega duas vezes): uma linha só por pedido, e um pedido `confirmado` nunca volta para `a_confirmar`. → testes em Task 4 (`test_proximo_status_*`, `test_ingerir_idempotente`).
2. **Variante não ligada** no pedido: o pedido entra, o item fica sem produto e a confirmação exige escolher. → Task 4 `test_item_sem_vinculo_entra`; Task 9 `linhasDoPedido` com item sem produto.
3. **Confirmar duas vezes** (duas abas ou duplo clique): a segunda falha sem criar venda. → Task 2 check `confirmar_pedido_canal` duas vezes.
4. **Reserva maior que o estoque**: quantidade enviada é 0, nunca negativa. → Task 5 `test_quantidade_nunca_negativa`.
5. **Shopify fora do ar ou token vencido na sincronização**: o produto continua na fila, o erro fica no vínculo e a próxima drenagem tenta de novo. → Task 5 `test_sincronizar_falha_mantem_fila`.
6. **Webhook com assinatura inválida**: 401 e nada gravado. → Task 6 `test_webhook_hmac_invalido`.

---

### Task 1: Tipo de produto

**Files:**
- Create: `supabase/migrations/20261118100000_tipos_produto.sql`, `supabase/checks/20261118100000_tipos_produto_check.sql`
- Create: `frontend/src/pages/estoque/TiposProduto.tsx` (cópia do padrão de `Marcas.tsx`, com a coluna "Vende em decant")
- Modify: `frontend/src/App.tsx` (rota `cadastros/tipos`), `frontend/src/pages/estoque/Cadastros.tsx` (aba `{ id: 'tipos', label: 'Tipos', icon: 'tag', path: '/estoque/cadastros/tipos', tabela: 'tipos_produto' }`), `frontend/src/pages/estoque/Produtos.tsx` (campo Tipo, obrigatório, default Perfume), `frontend/src/pages/estoque/decants/AbrirFrascoModal.tsx` e a lista "abrir lacrado" do `VendaFormModal.tsx` (só produtos de tipo com `vende_decant`)
- Create: `frontend/src/lib/tipos.ts`; Test: `frontend/src/lib/__tests__/tipos.test.ts`

**Interfaces:**
- Produces: tabela `tipos_produto(id uuid pk default gen_random_uuid(), nome text unique not null, vende_decant boolean not null default false, created_at timestamptz default now())`; coluna `produtos.tipo_id uuid not null references tipos_produto(id)`; sementes `Perfume` (true), `Creme` (false), `Body splash` (false); `export function vendeDecant(p: { tipo_id: string | null }, tipos: { id: string; vende_decant: boolean }[]): boolean` (produto sem tipo → `true`, para não esconder perfume antigo antes da migration).

- [ ] **Step 1:** Migration: cria a tabela, sementes (`on conflict (nome) do nothing`), `add column if not exists tipo_id`, `update produtos set tipo_id = <id do Perfume> where tipo_id is null`, `set not null`, e um trigger `before insert` em `produtos` que preenche o Perfume quando `tipo_id` vem nulo (default com subselect não é permitido). RLS com a policy "Acesso total autenticados" igual às outras tabelas.
- [ ] **Step 2:** Check SQL: conta 3 sementes; nenhum produto com `tipo_id` nulo; insert de produto sem tipo recebe Perfume (dentro de `begin; ... rollback;`).
- [ ] **Step 3:** Teste que falha: `vendeDecant` → `true` para Perfume, `false` para Creme, `true` para `tipo_id: null`. Rodar `npx vitest run src/lib/__tests__/tipos.test.ts` → FAIL.
- [ ] **Step 4:** Implementar `lib/tipos.ts`; teste PASS.
- [ ] **Step 5:** Telas: aba Tipos, campo Tipo no cadastro/edição de produto (`Select`), filtro de `vendeDecant` no `AbrirFrascoModal` e nas opções de abrir lacrado do `VendaFormModal`. `npm run build` com saída 0; `npx vitest run` inteiro verde.
- [ ] **Step 6:** Commit `feat(tipos): tipo de produto com venda em decant configurável`.

### Task 2: Banco do núcleo de canais

**Files:**
- Create: `supabase/migrations/20261118110000_canais_nucleo.sql`, `supabase/checks/20261118110000_canais_nucleo_check.sql`

**Interfaces:**
- Produces (nomes exatos usados pelas tarefas seguintes):
  - `insert into canais (nome, taxa_padrao, usa_envio, ativo) select 'Shopify', 0, true, true where not exists (... nome = 'Shopify')`.
  - `shopify_conexao(id int pk default 1 check (id=1), access_token text, expires_at timestamptz, location_id text, conectado_em timestamptz, updated_at timestamptz)` — RLS sem policy.
  - `canal_vinculos(id uuid pk, canal text not null check (canal in ('shopify','ml')), produto_id uuid not null references produtos, tipo text not null check (tipo in ('frasco','decant')), ml numeric(6,1), externo_produto_id text, externo_variante_id text not null, externo_estoque_id text, titulo text, ultima_qtd int, sincronizado_em timestamptz, erro text, created_at timestamptz default now(), unique (canal, externo_variante_id), check ((tipo='decant') = (ml is not null)))` — policy autenticados.
  - `pedidos_canal(id uuid pk, canal text not null, externo_id text not null, numero text, status text not null check (status in ('aguardando_pagamento','a_confirmar','confirmado','cancelado','cancelado_pos_confirmacao')), cliente text, criado_em timestamptz, total numeric(12,2), frete numeric(12,2) default 0, itens jsonb not null default '[]', venda_id uuid references vendas(id), alerta text, created_at timestamptz default now(), updated_at timestamptz default now(), unique (canal, externo_id))` — policy autenticados. `itens[]` = `{variante_id text, titulo text, quantidade int, preco_unitario numeric, produto_id uuid|null, tipo 'frasco'|'decant'|null, ml numeric|null}`.
  - `canal_sync_fila(produto_id uuid pk references produtos on delete cascade, criado_em timestamptz default now())` e `canais_sync_config(id int pk default 1 check (id=1), url text, segredo text)` — ambas RLS sem policy.
  - Gatilho `_canal_sync_marcar()` (`security definer`): se o produto tem linha em `canal_vinculos`, `insert into canal_sync_fila ... on conflict do nothing` e, se `canais_sync_config.url` não é nulo, `perform net.http_post(url := cfg.url, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','X-Horus-Sync', cfg.segredo))`. Ligado em `produtos` (`after update of estoque_atual`) e `frascos_abertos` (`after insert or update of ml_restante, status or delete`). `create extension if not exists pg_net with schema extensions` **(conferir nome do schema no projeto)**. O pg_net só envia depois do commit; transação desfeita não avisa.
  - `confirmar_pedido_canal(p_pedido_id uuid, p_canal_id uuid, p_data_venda date, p_forma_pagamento text, p_cliente text, p_taxa_total numeric, p_frete numeric, p_responsavel text, p_observacao text, p_itens jsonb, p_titulo text default null, p_insumos_envio jsonb default '[]') returns jsonb`: `select ... for update`; se `status <> 'a_confirmar'` → `raise exception 'Pedido não está a confirmar (%)', status`; chama `registrar_venda(...)` com os mesmos argumentos; grava `status='confirmado', venda_id, updated_at=now()`; retorna o jsonb da venda.
  - `desfazer_pedido_canal(p_pedido_id uuid) returns void`: trava; exige `status='cancelado_pos_confirmacao'`; `perform cancelar_venda(venda_id)`; `status='cancelado', alerta=null`.

- [ ] **Step 1:** Escrever a migration com os objetos acima e os índices `pedidos_canal (status)` e `canal_vinculos (produto_id)`.
- [ ] **Step 2:** Check SQL (em `begin; ... rollback;`, no padrão de `supabase/checks/20261116110000_insumos_rpcs_check.sql`): cria produto e pedido `a_confirmar` com 1 frasco; `confirmar_pedido_canal` baixa `estoque_atual` em 1 e grava `venda_id`; **segunda chamada levanta exceção e não cria outra venda** (Review Focus 3); update de `estoque_atual` de produto com vínculo cria linha em `canal_sync_fila`; produto sem vínculo não cria; `desfazer_pedido_canal` devolve o estoque e marca `cancelado`.
- [ ] **Step 3:** Commit `feat(canais): banco do núcleo de vendas dos canais`. Avisar o Luis de que precisa aplicar as migrations das Tasks 1 e 2 e rodar os checks.

### Task 3: Cliente Shopify

**Files:**
- Create: `backend/app/services/shopify/__init__.py`, `backend/app/services/shopify/cliente.py`
- Modify: `backend/app/config.py` (`shopify_loja: str = ''` — domínio `xxx.myshopify.com`; `shopify_client_id`, `shopify_client_secret`, `horus_sync_secret`)
- Test: `backend/tests/test_shopify_cliente.py`

**Interfaces:**
- Produces:
  - `class ShopifyErro(Exception)` com `.mensagem: str`; `class ShopifyDesconectado(Exception)`.
  - `def verificar_hmac(corpo: bytes, assinatura: str | None) -> bool` — `base64(hmac_sha256(shopify_client_secret, corpo))` comparado com `hmac.compare_digest`; segredo vazio ou assinatura ausente → `False`.
  - `class ShopifyCliente(http: httpx.Client | None = None, db=None)` com `graphql(query: str, variables: dict | None = None) -> dict` (devolve `data`; `errors` no corpo ou HTTP ≥ 400 → `ShopifyErro`; `userErrors` não vazio em qualquer campo de primeiro nível de `data` → `ShopifyErro` com as mensagens unidas por `; `) e `location_id: str` (lido de `shopify_conexao`).
  - Token: lê `shopify_conexao`; sem linha ou sem `conectado_em` → `ShopifyDesconectado`; vencendo em < 5 min → `POST https://{loja}/admin/oauth/access_token` (form `client_id`, `client_secret`, `grant_type=client_credentials`), grava `access_token`, `expires_at = agora + expires_in`. Cabeçalho `X-Shopify-Access-Token`. URL `https://{loja}/admin/api/{API_VERSAO}/graphql.json`.
  - `def obter_token(http) -> dict` (usado no conectar da Task 6).

- [ ] **Step 1:** Testes que falham (com `httpx.MockTransport` e banco falso no padrão de `tests/test_anuncios_router.py`): `test_hmac_valido`, `test_hmac_invalido`, `test_hmac_sem_segredo_recusa`, `test_renova_token_vencido` (grava novo `access_token`), `test_usa_token_valido_sem_renovar`, `test_user_errors_vira_shopify_erro`, `test_sem_conexao_desconectado`.
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Registrar auditoria dos `.py`; commit `feat(shopify): cliente da Admin API com token e HMAC`.

### Task 4: Pedidos — normalizar e ingerir

**Files:**
- Create: `backend/app/services/canais/__init__.py`, `backend/app/services/canais/pedidos.py`
- Test: `backend/tests/test_canais_pedidos.py`

**Interfaces:**
- Consumes: tabelas da Task 2.
- Produces:
  - `PedidoNorm = TypedDict` com `externo_id: str, numero: str, criado_em: str (ISO), pagamento: Literal['pendente','pago','reembolsado','reembolso_parcial','anulado'], cancelado: bool, cliente: str | None, total: Decimal, frete: Decimal, reembolsado: Decimal, itens: list[{variante_id: str, titulo: str, quantidade: int, preco_unitario: Decimal}]`.
  - `normalizar_webhook(p: dict) -> PedidoNorm` (payload REST do webhook: `id`, `name`, `created_at`, `financial_status`, `cancelled_at`, `customer.first_name/last_name`, `total_price`, `shipping_lines[].price`, `refunds[].transactions[].amount`, `line_items[]` com `variant_id`, `title`, `variant_title`, `quantity`, `price`, `discount_allocations[].amount`; preço unitário = `(price × quantity − Σ descontos) ÷ quantity`, 2 casas).
  - `normalizar_graphql(n: dict) -> PedidoNorm` (nó de `orders`: `legacyResourceId`, `name`, `createdAt`, `displayFinancialStatus`, `cancelledAt`, `customer.displayName`, `currentTotalPriceSet`, `totalShippingPriceSet`, `totalRefundedSet`, `lineItems.nodes[]` com `variant.legacyResourceId`, `title`, `variantTitle`, `quantity`, `discountedUnitPriceAfterAllDiscountsSet`) **(conferir nomes na doc)**.
  - Mapa de pagamento: `pending`/`PENDING` → pendente; `paid`, `authorized`, `partially_paid` → pago; `refunded` → reembolsado; `partially_refunded` → reembolso_parcial; `voided`, `expired` → anulado.
  - `proximo_status(atual: str | None, p: PedidoNorm) -> tuple[str, str | None]` (status, alerta):

    | atual | entrada | resultado |
    |---|---|---|
    | None/aguardando/a_confirmar | cancelado ou anulado ou reembolsado | `cancelado`, None |
    | None/aguardando/a_confirmar | pendente | `aguardando_pagamento`, None |
    | None/aguardando/a_confirmar | pago | `a_confirmar`, None |
    | a_confirmar | pendente (aviso fora de ordem) | `a_confirmar`, None (não regride) |
    | confirmado | cancelado ou reembolsado | `cancelado_pos_confirmacao`, `'Cancelado na Shopify — desfazer venda?'` |
    | confirmado | reembolso_parcial | `confirmado`, `'Reembolso parcial de R$ X na Shopify'` (X = `reembolsado`, formato `1.234,56`) |
    | confirmado | outro | `confirmado`, alerta atual mantido |
    | cancelado / cancelado_pos_confirmacao | qualquer | sem mudança |
  - `ingerir(db, canal: str, p: PedidoNorm, conectado_em: datetime) -> list[str]`: ignora pedido com `criado_em < conectado_em` (retorna `[]`); resolve cada item por `canal_vinculos (canal, externo_variante_id)` preenchendo `produto_id/tipo/ml` (sem vínculo → nulos); upsert por `(canal, externo_id)` com o resultado de `proximo_status`; na atualização, **não** sobrescreve `itens` de pedido `confirmado`; retorna os `produto_id` afetados (antigos e novos) para sincronizar.

- [ ] **Step 1:** Testes que falham: `test_normalizar_webhook_desconto` (2 unid. a 100 com 20 de desconto → 90,00), `test_normalizar_graphql_equivale_webhook` (mesmo pedido nas duas formas → mesmo `PedidoNorm`), `test_proximo_status_*` (uma por linha da tabela), `test_ingerir_idempotente` (duas vezes → 1 linha), `test_updated_antes_do_create` (pago chega antes, depois o create pendente → continua `a_confirmar`), `test_item_sem_vinculo_entra`, `test_ignora_anterior_a_conexao`, `test_confirmado_nao_troca_itens`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Auditoria; commit `feat(canais): normalização e ingestão de pedidos da Shopify`.

### Task 5: Estoque dos canais — reserva e sincronização

**Files:**
- Create: `backend/app/services/canais/estoque.py`
- Test: `backend/tests/test_canais_estoque.py`

**Interfaces:**
- Consumes: `ShopifyCliente` (Task 3); tabelas da Task 2; `ml_aberto(db, produto_id)` de `app/services/anuncios/publicar.py`.
- Produces:
  - `reservas(pedidos: list[dict]) -> dict[str, tuple[int, Decimal]]` — por `produto_id`: (unidades de frasco reservadas, ml de decant reservados), só status `aguardando_pagamento`/`a_confirmar` e itens com `produto_id`.
  - `quantidade_canal(estoque_atual: int, volume_ml, ml_aberto: Decimal, tipo: str, ml, reserva: tuple[int, Decimal]) -> int`: frasco = `max(estoque − unid, 0)`; decant = `max(floor((ml_aberto + estoque × volume − ml_reservado − unid × volume) ÷ ml), 0)` (frasco reservado também consome do saldo, spec 7.7).
  - `sincronizar(db, cliente, produto_ids: list[str] | None) -> dict` (`None` = todos os vínculos `shopify`): calcula a quantidade de cada vínculo e envia **numa chamada** `inventorySetQuantities(input: {name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: [{inventoryItemId, locationId, quantity}]})` **(conferir campo de compare na versão)**, até 250 por chamada; sucesso → `ultima_qtd`, `sincronizado_em`, `erro=null` e remove da fila os produtos enviados; erro → grava `erro` nos vínculos e **mantém na fila**. Retorna `{'enviados': n, 'erros': [..]}`.
  - `drenar_fila(db, cliente) -> dict`: lê `canal_sync_fila`, chama `sincronizar` com esses ids.

- [ ] **Step 1:** Testes que falham: `test_quantidade_frasco_desconta_reserva`, `test_quantidade_decant_divide_saldo` (100 ml lacrado ×1 + 7 ml aberto, reserva 5 ml, decant 5 → 20), `test_quantidade_nunca_negativa`, `test_reservas_ignora_confirmado_e_sem_produto`, `test_sincronizar_envia_e_limpa_fila`, `test_sincronizar_falha_mantem_fila`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Auditoria; commit `feat(canais): reserva e sincronização de estoque com a Shopify`.

### Task 6: Rotas da Shopify e dos canais

**Files:**
- Create: `backend/app/routers/shopify.py`, `backend/app/routers/canais.py`
- Modify: `backend/app/main.py` (`/api/shopify`, `/api/canais`; handlers de `ShopifyDesconectado` → 409 `'Shopify não conectada'` e `ShopifyErro` → 502 com a mensagem)
- Test: `backend/tests/test_shopify_router.py`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces (todas com `get_current_user`, salvo onde dito):
  - `GET /api/shopify/conexao` → `{conectado: bool, loja: str | None, conectado_em}` (sem token).
  - `POST /api/shopify/conectar` → obtém token, lê `locations(first: 1)` → `location_id`, assina `webhookSubscriptionCreate` para `ORDERS_CREATE` e `ORDERS_UPDATED` com `uri = {base}/api/shopify/webhooks/pedidos` (`base` = URL pública do backend: `str(request.base_url)` com `https`), grava `conectado_em = now()` só se ainda nulo (reconectar não muda o corte). Sem variáveis → 503 `'Shopify não configurada'`.
  - `GET /api/shopify/variantes?cursor=` → `{itens: [{produto_id_ext, produto_titulo, variante_id, variante_titulo, sku, estoque_id, vinculo: {produto_id, tipo, ml} | null}], proximo: str | null}` (50 produtos por página).
  - `POST /api/shopify/vinculos` body `{variante_id, produto_ext_id, estoque_id, titulo, produto_id, tipo, ml}` → upsert por `(canal, externo_variante_id)` e sincroniza o produto; `DELETE /api/shopify/vinculos/{variante_id}`. Valida `tipo='decant'` ⇔ `ml > 0`, e decant só para produto com tipo `vende_decant` (422).
  - `POST /api/shopify/webhooks/pedidos` (**público**): lê o corpo cru; `verificar_hmac` falso → 401 sem gravar; senão `normalizar_webhook` → `ingerir` → `sincronizar` dos produtos afetados (falha de sincronização não derruba o 200: o produto fica na fila). Responde 200 `{}`.
  - `POST /api/canais/pedidos/conferir` → busca na Shopify pedidos com `updated_at >= (último updated_at de pedidos_canal shopify ou conectado_em)` via `orders(first: 50, query: "updated_at:>=...")` com paginação, `ingerir` cada um, `drenar_fila`; retorna `{novos: n}`.
  - `POST /api/canais/sincronizar` → `sincronizar(db, cliente, None)`.
  - `POST /api/canais/sync` (**público**, chamado pelo gatilho): cabeçalho `X-Horus-Sync` igual a `settings.horus_sync_secret` (vazio → sempre 401) → `drenar_fila`.

- [ ] **Step 1:** Testes que falham (TestClient + banco falso + `MockTransport`): `test_webhook_hmac_invalido` (401, nenhuma linha), `test_webhook_valido_grava_e_sincroniza`, `test_webhook_repetido_uma_linha`, `test_sync_sem_segredo_401`, `test_conferir_ingere_pedidos`, `test_vinculo_decant_em_creme_422`, `test_conexao_nao_expoe_token`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS; rodar a suíte toda do backend.
- [ ] **Step 5:** Auditoria; commit `feat(shopify): rotas de conexão, vínculos, webhook e sincronização`.

### Task 7: Publicar produto na Shopify (backend)

**Files:**
- Create: `backend/app/services/shopify/publicar.py`
- Modify: `backend/app/routers/shopify.py`
- Test: `backend/tests/test_shopify_publicar.py`

**Interfaces:**
- Consumes: `ShopifyCliente`, `sincronizar`.
- Produces:
  - `montar_produto(dados: dict, location_id: str) -> dict` (input do `productSet`): `title`, `descriptionHtml` (texto com `\n` → `<br>`, escapado com `html.escape`), `status: ACTIVE`, `productOptions: [{name: 'Tamanho', values: [{name: rótulo}...]}]`, `variants: [{optionValues: [{optionName: 'Tamanho', name: rótulo}], price: '129.90', inventoryItem: {tracked: true}, inventoryQuantities: [{locationId, name: 'available', quantity: 0}]}]`, `files: [{originalSource: url, contentType: IMAGE}]` (URLs vazias filtradas). Rótulo: frasco → `'Frasco {ml} ml'` (tipo Perfume) ou `'{ml} ml'` (outros tipos); decant → `'Decant {ml} ml'`; ml com vírgula (`2,5`) **(conferir campos do productSet)**.
  - `POST /api/shopify/produtos` body `{produto_id, titulo, descricao, fotos: [str], variantes: [{tipo, ml | null, preco}]}` → recusa 409 se o produto já tem vínculo `shopify` (`'Produto já está na Shopify: use Ligar produtos'`); chama `productSet(synchronous: true)`; grava um `canal_vinculos` por variante (casando pela ordem/rótulo devolvido); sincroniza o produto; retorna `{produto_ext_id, variantes: n}`. Falha de rede depois do envio → 502 `'Falha de rede: confira na Shopify antes de tentar de novo'`.

- [ ] **Step 1:** Testes que falham: `test_montar_produto_perfume_com_decants` (3 variantes, rótulos `Frasco 100 ml`, `Decant 2,5 ml`, `Decant 5 ml`, preços como texto com 2 casas), `test_montar_produto_creme_rotulo`, `test_descricao_escapada`, `test_publicar_grava_vinculos`, `test_publicar_duas_vezes_409`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** Auditoria; commit `feat(shopify): publicar produto com variantes`.

### Task 8: Frontend — lib, cliente da API, conexão e ligar produtos

**Files:**
- Create: `frontend/src/lib/canais.ts`, `frontend/src/lib/apiShopify.ts`, `frontend/src/pages/anuncios/LigarShopify.tsx`
- Modify: `frontend/src/pages/anuncios/AnunciosConfig.tsx` (seção Shopify: status, Conectar, Sincronizar tudo, resultado), `frontend/src/App.tsx` (`/anuncios/shopify/ligar`, `/anuncios/shopify/novo`), `frontend/src/components/layout/Layout.tsx` (`ANU_NAV`: "Publicar na Shopify", "Ligar Shopify")
- Test: `frontend/src/lib/__tests__/canais.test.ts`, `frontend/src/pages/anuncios/__tests__/LigarShopify.test.tsx`

**Interfaces:**
- Consumes: rotas da Task 6/7; `custoAnuncio`, `tituloPadrao`, `descricaoPadrao` de `lib/anuncios.ts`.
- Produces:
  - `precoShopify(custo: number, margem: number, taxaPct: number): number` = menor valor terminado em `,90` ≥ `custo × (1 + margem) ÷ (1 − taxaPct/100)`, mínimo `8.90`; `taxaPct ≥ 100` → lança `Error('Taxa do canal inválida')`.
  - `linhasDoPedido(p: PedidoCanal): Partial<LinhaForm>[]` — item com `tipo='frasco'` → `{tipo:'produto', produto_id, quantidade, preco}`; `decant` → `{tipo:'decant', produto_id, ml, quantidade, preco}` (o frasco é escolhido pelo formulário); sem produto → `{tipo:'produto', produto_id:'', quantidade, preco}`.
  - `type PedidoCanal` (espelho de `pedidos_canal`), `ROTULO_STATUS: Record<status, string>`.
  - `apiShopify`: `conexao()`, `conectar()`, `variantes(cursor?)`, `ligar(body)`, `desligar(varianteId)`, `conferir()`, `sincronizarTudo()`, `publicar(body)` — mesmo padrão de fetch autenticado de `lib/apiAnuncios.ts`.

- [ ] **Step 1:** Testes que falham: `precoShopify(50, 0.6, 3.5)` → `83.90` (80 ÷ 0,965 = 82,9016), `precoShopify(50, 0.6, 0)` → `80.90`, `precoShopify(1, 0.6, 0)` → `8.90` (mínimo), taxa 100 lança; `linhasDoPedido` com frasco, decant e item sem produto; `LigarShopify` liga uma variante (usa `escolher()`), e oferece decant só para produto que vende decant.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar lib, API, tela de ligar (tabela produto/variante → Select produto + Select "Frasco/unidade | Decant X ml", paginação "carregar mais"), seção de conexão, nav e rotas. **Step 4:** PASS; `npm run build` saída 0.
- [ ] **Step 5:** Commit `feat(shopify): conexão e ligar produtos no Horus`.

### Task 9: Frontend — Vendas › A confirmar

**Files:**
- Create: `frontend/src/pages/estoque/vendas/AConfirmar.tsx`
- Modify: `frontend/src/pages/estoque/Vendas.tsx` (aba `'aconfirmar'` "A confirmar (n)" ao lado de Lista/Dashboard), `frontend/src/pages/estoque/vendas/VendaFormModal.tsx` (+ `NovaVendaModal.tsx` repassa props)
- Test: `frontend/src/pages/estoque/vendas/__tests__/AConfirmar.test.tsx`

**Interfaces:**
- Consumes: `linhasDoPedido`, `apiShopify.conferir`, RPCs `confirmar_pedido_canal` / `desfazer_pedido_canal` (Task 2).
- Produces: `VendaFormModalProps` ganha `pedido?: PedidoCanal`. Com `pedido` em modo `create`: pré-preenche canal `Shopify`, data (`criado_em`), cliente, título `Shopify {numero}`, linhas de `linhasDoPedido`, frete `0` com o texto "Cliente pagou {formatBRL(frete)} de frete"; ao salvar chama `confirmar_pedido_canal` com `p_pedido_id` + os mesmos argumentos de `registrar_venda`. Item sem produto mostra "Escolha o produto (não ligado na Shopify)" e bloqueia salvar até escolher (a validação do formulário já exige produto).

- [ ] **Step 1:** Testes que falham: ao abrir a aba chama `conferir()` uma vez e lista os pedidos com status `aguardando_pagamento`, `a_confirmar`, `cancelado_pos_confirmacao` ou com `alerta`; `aguardando_pagamento` mostra "Aguardando pagamento" e Confirmar desabilitado; Confirmar abre o formulário com as linhas do pedido e frete 0; pedido `cancelado_pos_confirmacao` tem "Desfazer venda" (chama `desfazer_pedido_canal`) e "Manter" (limpa `alerta`, volta `confirmado`); alerta de reembolso parcial tem "Ok" (limpa `alerta`).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (falha do `conferir()` mostra aviso e lista o que já está no banco). **Step 4:** PASS; suíte inteira e `npm run build` saída 0.
- [ ] **Step 5:** Commit `feat(vendas): lista a confirmar dos pedidos da Shopify`.

### Task 10: Frontend — Publicar na Shopify

**Files:**
- Create: `frontend/src/pages/anuncios/PublicarShopify.tsx`
- Test: `frontend/src/pages/anuncios/__tests__/PublicarShopify.test.tsx`

**Interfaces:**
- Consumes: `FotosPerfume({ produtoId, onChange })`, `fotosDoAnuncio`, `custoAnuncio`, `tituloPadrao`, `descricaoPadrao`, `precoShopify`, `vendeDecant`, `anuncios_config` (`margem_padrao`, `tamanhos_decant`, `modelo_descricao`), `canais.taxa_padrao` do Shopify, `apiShopify.publicar`.
- Produces: tela em `/anuncios/shopify/novo`: escolhe produto (`Select` com busca); marca "Frasco/unidade" e, se `vendeDecant`, os tamanhos da configuração; por variante mostra custo, preço sugerido (editável) e lucro; fotos (`FotosPerfume`); título (`tituloPadrao`, sem "Perfume" quando o tipo não é Perfume: usa o nome do tipo) e descrição (`descricaoPadrao`) editáveis; botão Publicar com resultado. Produto já publicado → mensagem do 409 com link para Ligar.

- [ ] **Step 1:** Testes que falham: creme não mostra opção de decant; preço sugerido = `precoShopify(custo, margem, taxa)`; editar preço é o que vai no `publicar`; Publicar envia `variantes` só das marcadas.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS; `npm run build` saída 0.
- [ ] **Step 5:** Commit `feat(shopify): tela de publicar produto`.

### Task 11: Documentação e ativação

**Files:**
- Create: `docs/features/SHOPIFY.md`
- Modify: `docs/00-INDEX.md`, `docs/BANCO.md`, `docs/API.md`, `docs/ARQUITETURA.md`, `docs/features/VENDAS.md`, `docs/features/ANUNCIOS.md` (Parte 3 do ML agora é "conector ML sobre o núcleo de canais"), `docs/HANDOFF_IA.md`, `docs/LOGS.md`

- [ ] **Step 1:** `SHOPIFY.md` com: telas, fluxo do pedido (tabela de status da Task 4), regra de quantidade, regra de preço, limites conhecidos, e **checklist de ativação** para o Luis:
  1. Aplicar as migrations `20261118100000` e `20261118110000` e rodar os checks.
  2. Dev Dashboard da Shopify (mesma organização da loja): criar app, escopos da seção Global Constraints, instalar na loja.
  3. Vercel `horusparfum-control-api` → variáveis `SHOPIFY_LOJA`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `HORUS_SYNC_SECRET` (texto aleatório) → Redeploy.
  4. SQL Editor: `insert into canais_sync_config (id, url, segredo) values (1, 'https://horusparfum-control-api.vercel.app/api/canais/sync', '<mesmo HORUS_SYNC_SECRET>') on conflict (id) do update set url = excluded.url, segredo = excluded.segredo;` (o Luis digita o segredo no SQL Editor, nunca no chat).
  5. Vendas › Configuração: taxa padrão do canal Shopify.
  6. Anúncios › Configuração › Conectar Shopify; Ligar Shopify; Sincronizar tudo.
  7. Teste: compra real/teste na loja → aparece em A confirmar em < 1 min, quantidade cai na loja; confirmar; cancelar um pedido de teste antes de confirmar e ver a quantidade voltar.
- [ ] **Step 2:** Atualizar os demais documentos e o HANDOFF/LOGS (sessão nova).
- [ ] **Step 3:** Commit `docs(shopify): integração Shopify e núcleo de canais`.
