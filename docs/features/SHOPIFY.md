# Shopify e núcleo de vendas dos canais

Spec: `docs/superpowers/specs/2026-11-18-shopify-canais-design.md`. Plano: `docs/superpowers/plans/2026-11-18-shopify-canais.md`.

O Horus é o ponto de encontro dos canais. Esta feature faz três coisas: vendas da Shopify entram sozinhas numa lista "A confirmar"; a quantidade na Shopify nunca passa do que o Horus tem; e produto novo pode ser publicado na Shopify a partir do Horus. O núcleo (pedidos, reserva, confirmação, fila de estoque) é neutro de canal: o canal externo é o texto `'shopify'` (depois `'ml'`).

## Telas

| Tela | Rota | O que faz |
|---|---|---|
| Tipos de produto | `/estoque/cadastros/tipos` (`TiposProduto.tsx`) | Lista editável de tipos (Perfume, Creme, Body splash) e se cada um "pode vender em decant". |
| Configuração de Anúncios | `/anuncios/config` (`AnunciosConfig.tsx`) | Bloco "Loja Shopify": mostra a loja conectada, botão **Conectar Shopify** e **Sincronizar tudo**. |
| Ligar produtos da Shopify | `/anuncios/shopify/ligar` (`LigarShopify.tsx`) | Lista cada variante da loja; o Luis liga a um produto do Horus (frasco ou decant de X ml). Variante sem ligação vende normalmente e o Horus não mexe na quantidade dela. |
| Publicar na Shopify | `/anuncios/shopify/novo` (`PublicarShopify.tsx`) | Escolhe o produto, marca as variantes (frasco, decants), vê o preço sugerido e o lucro, edita e publica. Decant só para tipo que vende decant. Bloqueia publicar sem o canal Shopify cadastrado. |
| A confirmar | Vendas (`estoque/vendas/AConfirmar.tsx`) | Lista os pedidos da Shopify; confirmar abre o formulário de venda já preenchido. |

## Fluxo do pedido

O pedido chega por **webhook** (`POST /api/shopify/webhooks/pedidos`, validado por HMAC). Ao abrir "A confirmar", o frontend chama `POST /api/canais/pedidos/conferir`, que busca na Shopify o que o webhook possa ter perdido.

O pedido fica em `pedidos_canal` com um status (regra em `services/canais/pedidos.py`, `proximo_status`):

| Status | Quando | Reserva estoque? |
|---|---|---|
| `aguardando_pagamento` | Pedido novo com pagamento pendente (ou status de pagamento desconhecido) | Sim |
| `a_confirmar` | Pago ou autorizado. Nunca volta para `aguardando_pagamento` | Sim |
| `confirmado` | O Luis confirmou: virou venda (`venda_id`) | Não (a venda já baixou o estoque) |
| `cancelado` | Cancelado, anulado ou reembolsado na Shopify antes de confirmar; ou "desfazer" concluído | Não |
| `cancelado_pos_confirmacao` | Cancelado ou reembolsado na Shopify depois de confirmado; alerta "Cancelado na Shopify — desfazer venda?" | Não |

Detalhes:
- Pedido com pagamento pendente **reserva, mas não pode ser confirmado**: só `a_confirmar` confirma.
- Reembolso parcial grava o alerta "Reembolso parcial de R$ X na Shopify": pedido confirmado continua `confirmado`; pedido aberto vai para `a_confirmar` com o alerta, que aparece também no formulário de confirmação (acima dos itens).
- **Alerta dispensado não volta** (`pedidos_canal.alerta_dispensado`): **Manter** (cancelado depois de confirmado) grava `'cancelado'` e o pedido fica `confirmado` mesmo que a conferência releia o cancelamento; **Ok** grava o texto do alerta, e só um reembolso de valor diferente alerta de novo. Confirmar o pedido conta como Ok do alerta que estava nele.
- Pedido aberto que é cancelado na Shopify perde o alerta (fica só `cancelado`).
- Linha de pedido com quantidade 0 (removida por edição na Shopify) é ignorada.
- Confirmar e desfazer **nunca são automáticos**. Cancelamento de venda já confirmada só acontece quando o Luis clica em desfazer (`desfazer_pedido_canal`, que cancela a venda e devolve o estoque).
- A ingestão é idempotente (compare-and-swap): aviso repetido ou fora de ordem não regride o status nem recria venda. Itens de pedido confirmado não mudam.
- Pedidos anteriores ao primeiro **Conectar** (`conectado_em`) são ignorados.
- Pedido marcado como enviado na Shopify continua em "A confirmar". O Horus não escreve fulfillment.
- **Conferir relê os últimos 7 dias** (janela, não marca d'água): como `ingerir` é idempotente, um webhook perdido volta na próxima conferência.
- **Abrir lacrado funciona direto no formulário de venda** (manual e confirmação): se o perfume não tem frasco aberto, o decant sai de um lacrado aberto na hora.
- **Excluir uma venda que veio de pedido** zera `pedidos_canal.venda_id` (FK `on delete set null`); o pedido permanece.

### Confirmar

`confirmar_pedido_canal` chama `registrar_venda` com os mesmos argumentos e marca o pedido `confirmado` na mesma transação (trava com `for update`, não confirma duas vezes).
- **Taxa:** a `taxa_padrao` do canal Shopify (o `VendaFormModal` calcula quando a taxa está vazia).
- **Frete começa em 0.** O frete pago pelo cliente aparece ao lado ("Cliente pagou R$ X de frete") só como informação. Motivo: em `registrar_venda` o frete é só despesa; pré-preencher com o valor pago baixaria o lucro sem a receita correspondente. O campo é editável.
- Troca de perfume e item sem ligação são resolvidos no formulário pelo Luis. Ao confirmar, os produtos dos itens **originais** do pedido entram na fila de estoque: a reserva deles acabou mesmo que a venda tenha trocado o perfume ou tirado a linha.

## Regra de quantidade (Horus para a Shopify)

Calculada em `services/canais/estoque.py` e enviada com `inventorySetQuantities` (lotes de 250).
- **Frasco:** `estoque_atual - unidades reservadas` (mínimo 0).
- **Decant de X ml:** `floor((ml abertos + estoque_atual x volume_ml - ml reservados - unidades reservadas x volume_ml) / X)` (mínimo 0).
- Reservado = itens dos pedidos `aguardando_pagamento` e `a_confirmar`. Item gravado sem produto (o pedido chegou antes de a variante ser ligada) reserva pela variante, assim que ela for ligada.
- Um gatilho no banco (mudança de `estoque_atual` do produto e de `frascos_abertos`) põe o produto na fila `canal_sync_fila` (função `_canal_sync_enfileirar`) e, se houver URL configurada, avisa o backend por `pg_net` (`POST /api/canais/sync`, segredo no cabeçalho `X-Horus-Sync`). A fila só é limpa depois do envio; se falhar, o produto fica na fila e o erro aparece no vínculo (`canal_vinculos.erro`).
- **Todo envio passa pela fila e por um dreno só** (`drenar_fila`): webhook, ligar variante, publicar, conferir, Sincronizar tudo e `/api/canais/sync` enfileiram os produtos e chamam o dreno. Um **lease** no banco (`canal_sync_lease`, RPCs `pegar_lease_sync` / `soltar_lease_sync`, 60 s) garante um dreno por vez; quem chega com o lease ocupado só deixa o produto na fila (resposta `ocupado: true`). Reenfileirar **avança** `criado_em`, e o dreno só limpa o que entrou até o corte dele; por isso repete (até 5 voltas) enquanto chegar mudança nova durante o envio. Falha não é repetida na mesma chamada. Produto desligado depois de enfileirado sai da fila.
- Vendas da loja física e do WhatsApp continuam manuais, mas movem o estoque e, portanto, a quantidade nos canais.

## Regra de preço (publicar)

`precoShopify(custo, margem, taxaPct)` em `lib/canais.ts`: `custo x (1 + margem) / (1 - taxa)`, arredondado para cima ao próximo valor terminado em **,90**, mínimo **R$ 8,90**. A margem vem de Anúncios › Configuração; a taxa é a `taxa_padrao` do canal Shopify (Vendas › Configuração). O preço é editável por variante. Depois de publicado, o Horus só mexe em quantidade (título, fotos e preço ele não altera).

## Rotas e banco

- Rotas: [[API]], seção 15 (`/api/shopify/*` e `/api/canais/*`).
- Tabelas e RPCs: [[BANCO]] (`tipos_produto`, `produtos.tipo_id`, `shopify_conexao`, `canal_vinculos`, `pedidos_canal`, `canal_sync_fila`, `canais_sync_config`, `canal_sync_lease`, canal "Shopify", `confirmar_pedido_canal`, `desfazer_pedido_canal`, `pegar_lease_sync`, `soltar_lease_sync`). Migrations `20261118100000_tipos_produto.sql` e `20261118110000_canais_nucleo.sql`; conferência em `supabase/checks/`.

## Checklist de ativação

> Estado em 24/11/2026: código pronto na `main`, **sem push**, SQL **não aplicado**, app da Shopify **não criado**.

1. Aplicar no SQL Editor (projeto `wyobbztexoofhqdttxzq`) as migrations `20261118100000` e `20261118110000` e rodar os checks de `supabase/checks/`.
2. **Dev Dashboard** da Shopify (na mesma organização da loja; senão o erro é `shop_not_permitted`): criar o app, dar os escopos `read_products, write_products, read_inventory, write_inventory, read_locations, read_orders` e instalar na loja.
3. Vercel `horusparfum-control-api` → variáveis `SHOPIFY_LOJA` (domínio `*.myshopify.com`), `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` e `HORUS_SYNC_SECRET` (texto aleatório) → **Redeploy**.
4. SQL Editor (o Luis digita o segredo lá, nunca no chat):
   ```sql
   insert into canais_sync_config (id, url, segredo) values (1, 'https://horusparfum-control-api.vercel.app/api/canais/sync', '<mesmo HORUS_SYNC_SECRET>') on conflict (id) do update set url = excluded.url, segredo = excluded.segredo;
   ```
5. Vendas › Configuração: definir a taxa padrão do canal Shopify.
6. Anúncios › Configuração › **Conectar Shopify**; depois **Ligar produtos** (ligar as variantes) e **Sincronizar tudo**.
7. Teste: compra real ou de teste na loja → aparece em A confirmar em menos de 1 minuto e a quantidade cai na loja; confirmar; cancelar um pedido de teste antes de confirmar e ver a quantidade voltar.

O push da `main` publica backend e frontend sozinho (Vercel).

## Limites conhecidos e a conferir

Conferir na documentação da Shopify ao ativar (o código foi escrito sem testar contra a loja real). Na revisão final de 24/11/2026 o shopify.dev não abriu desta máquina (erro de certificado TLS), então os itens abaixo seguem **sem conferência** e o código não mudou:
- `API_VERSAO = '2026-10'` em `services/shopify/cliente.py`: confirmar que é a versão estável vigente.
- `webhookSubscriptionCreate`: o código usa o campo `uri`; confirmar se a versão pede `uri` ou `callbackUrl`.
- `inventorySetQuantities`: o código usa `ignoreCompareQuantity: true`; confirmar o campo na versão. **Atenção (de memória, não verificado):** versões recentes da Admin API podem ter trocado `compareQuantity`/`ignoreCompareQuantity` por `changeFromQuantity` (por quantidade) e exigir a diretiva `@idempotent(key: ...)` nas mutações de estoque. Se for o caso, a primeira sincronização volta com `userErrors`/erro de schema e aparece em `canal_vinculos.erro`.
- `productSet` (publicar): confirmar os campos de entrada usados em `services/shopify/publicar.py`.
- `pg_net` é criado no schema `extensions` (as funções ficam em `net`); se o `create extension` falhar, ver o schema no projeto.
- `variants(first: 100)`: produto com mais de 100 variantes é cortado na tela de ligar (comentário `ponytail:` no código).

Outros:
- Uma loja Shopify só. Cremes e cosméticos só na Shopify (o ML segue em perfumes).
- Kits (vários produtos num item) ficam para depois: a conversão item do pedido para itens da venda é um ponto só (`linhasDoPedido`).
- O token da Shopify dura cerca de 24 h e o backend renova; só o service role lê `shopify_conexao`.
- **Parte 3 do ML** (vendas do ML) agora é o **conector do ML sobre o núcleo de canais**: usa `pedidos_canal`, `canal_vinculos` (`canal = 'ml'`) e a fila de estoque. Continua esperando a chave do app do ML ([[features/ANUNCIOS]]).

## Arquivos

- Backend: `routers/shopify.py`, `routers/canais.py`, `services/shopify/{cliente,publicar}.py`, `services/canais/{pedidos,estoque}.py`.
- Frontend: `pages/anuncios/{LigarShopify,PublicarShopify,AnunciosConfig}.tsx`, `pages/estoque/vendas/AConfirmar.tsx`, `pages/estoque/TiposProduto.tsx`, `lib/canais.ts`, `lib/apiShopify.ts`.
