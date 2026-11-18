# Design — Shopify + núcleo de vendas e estoque dos canais

> Brainstorming de 17 e 18/11/2026 com o Luis. Onde está escrito **(decisão do Claude)**, a escolha foi
> minha e não foi validada pelo Luis. **(conferir)** é conhecimento que o plano deve validar na documentação
> da Shopify antes de codar.
>
> Continua o design de Anúncios (`2026-11-16-anuncios-design.md`). A **Parte 3 (Vendas do ML)** daquele
> documento é absorvida por este: o núcleo daqui serve aos dois canais, e as decisões da seção 7 de lá
> continuam valendo (troca de perfume, abrir frasco lacrado, lista como "o que embalar", cancelamento).

## 1. Por que existe

A Horus vende por quatro canais: Mercado Livre, loja Shopify (site próprio), loja física e WhatsApp. O
Horus é o único lugar que enxerga estoque e financeiro de todos, então **toda venda de todo canal precisa
cair nele**. Hoje isso é manual e falha: vendas esquecidas, vendas lançadas duas vezes, estoque que não
baixa quando sai venda no site ou no ML. O resultado são furos de estoque **e** de lucro/faturamento.

Palavras do Luis: "é pra todos os 3 se conversarem, sendo o site horusparfum-control o ponto de encontro
de todos". "O que dá mais trabalho é cadastrar produto manualmente e também dar baixa em vendas no
sistema manualmente."

O que este trabalho resolve:
1. **Vendas da Shopify entram sozinhas** no Horus (e as do ML, quando a chave do app sair).
2. **Um estoque só**: vendeu em qualquer canal, a quantidade nos outros canais se ajusta.
3. **Cadastro uma vez no Horus** e publicação na Shopify (e no ML, que já existe), sem cadastrar à mão
   em cada lugar.

Só as vendas da loja física e do WhatsApp continuam lançadas à mão (são minoria) — mas elas também
atualizam a quantidade nos canais.

## 2. Ordem de construção

A Shopify vem primeiro, porque não depende de ninguém (o app do ML está bloqueado: ver memória/
`docs/features/ANUNCIOS.md`). O núcleo é construído neutro de canal; quando a chave do ML sair, ligar as
vendas do ML é um conector novo em cima dele.

Partes, cada uma com plano próprio ou fases de um mesmo plano (o construtor decide):
1. **Tipo de produto** (perfume, creme, body splash...).
2. **Conexão com a Shopify** + **ligar produtos existentes**.
3. **Núcleo de vendas dos canais**: pedidos "a confirmar", reserva, confirmação, cancelamento.
4. **Sincronização de estoque** Horus → canais.
5. **Publicar produto na Shopify** a partir do Horus (com preço pela margem).
6. (depois da chave) **Conector de pedidos do ML** sobre o núcleo da parte 3.

**(decisão do Claude)** A ordem 2 → 3 → 4 antes de 5 é porque a dor maior é dar baixa em venda, e os
produtos que já estão na loja precisam ser ligados de qualquer jeito. Publicar produto novo vem por
último.

## 3. Metas, não-metas e anti-metas

**Metas**
- Nenhuma venda da Shopify fica fora do Horus, e nenhuma entra duas vezes.
- A quantidade na Shopify (e no ML, depois) nunca é maior do que a Horus tem, descontando o que está
  reservado por pedidos ainda não confirmados.
- Confirmar uma venda sem troca é um clique.
- Cadastrar um produto novo e pô-lo à venda na Shopify sem entrar no painel da Shopify.

**Não-metas (fora desta versão)**
- Vendas da loja física e do WhatsApp automáticas (continuam manuais).
- Clientes, cupons, frete, checkout e tema da Shopify: o Horus não mexe. O frete é cotado pela própria
  loja (Correios/Melhor Envio); o Horus não gera etiqueta.
- Publicar **cremes e cosméticos no ML** **(decisão do Claude)**: o módulo de Anúncios do ML é feito para
  a categoria de perfumes (`MLB6284`); cosméticos no ML ficam para depois. Na Shopify, todos os tipos.
- Editar na Shopify, pelo Horus, produto já publicado (título, fotos, descrição) **(decisão do Claude)**,
  igual ao ML: depois de publicar, o Horus só mexe em **quantidade** e **preço quando o Luis manda**.
- Kits (vários produtos num item só), igual à decisão do design de Anúncios: a conversão "item do pedido
  → itens da venda" fica num único ponto do código, para kits entrarem depois.
- Mais de uma loja Shopify.

**Anti-metas (se acontecer, falhou mesmo funcionando)**
- Venda duplicada ou esquecida (é exatamente a dor de hoje).
- Baixa errada e silenciosa de estoque ou estorno de dinheiro sem o Luis ver: por isso toda venda passa
  por confirmação e cancelamento de venda já confirmada nunca é automático.
- Vender o mesmo frasco duas vezes porque a quantidade num canal estava velha.
- O Horus ficar mais trabalhoso do que lançar a venda à mão.

## 4. Restrições

Valem todas as da seção 4 do design de Anúncios. Em especial:
- **Segredos só no backend** (Client secret da Shopify, token de acesso, service role). A tabela da
  conexão Shopify só é acessível pelo service role (igual `ml_conexao`).
- **SQL aplicado à mão** pelo Luis no SQL Editor do projeto Horus (`wyobbztexoofhqdttxzq`). O MCP do
  Supabase da máquina aponta para outro projeto e **não** deve ser usado.
- Backend FastAPI no Vercel serverless: sem processo residente. Trabalho periódico só por webhook,
  chamada do frontend ou cron da Vercel (no plano atual, uma vez por dia). Deploy é automático a cada push
  na `main`.
- Operações de estoque/venda atômicas em RPC PL/pgSQL; prévia de cálculo em `frontend/src/lib/*.ts` com
  `decimal.js`; TDD nas libs; `formatBRL()`.
- Regra de auditoria e EDR da máquina do Luis (ver CLAUDE.md global e design de Anúncios).

## 5. Abordagem escolhida

Consideradas:
1. **Webhook da Shopify + conferência ao abrir a tela** — escolhida pelo Luis. A Shopify avisa o backend a
   cada pedido criado, cancelado ou reembolsado; a reserva e o ajuste de estoque acontecem em segundos. Ao
   abrir "A confirmar", o Horus também busca pedidos recentes na Shopify para pegar qualquer aviso
   perdido. Custo: validar a assinatura do aviso.
2. **Só consulta periódica** — descartada: o estoque nos canais só se ajusta quando alguém abre o Horus
   (ou uma vez por dia no cron), deixando a janela para vender o mesmo frasco duas vezes.
3. **Integrador pronto (Bling, Olist...)** — descartado: mensalidade, e ele vira o centro no lugar do
   Horus, o contrário do pedido.

## 6. O que o Luis decidiu

- Um estoque só para Horus, ML e Shopify; o Horus é o centro.
- Vendas da Shopify seguem **o mesmo padrão das do ML**: entram numa lista "a confirmar", **reservam**
  estoque (descontam da quantidade nos canais) e só baixam estoque/insumos/financeiro no Horus quando o
  Luis confirma. Valem as decisões da seção 7.1 do design de Anúncios (troca de perfume, abrir frasco
  lacrado, lista como "o que embalar").
- A Shopify vende frasco, decant, cremes e outros cosméticos. Todo cosmético vendido é líquido e tem
  volume em ml.
- **Tipo de produto configurável no cadastro**, com a lista de tipos editável.
- **Preço na Shopify sugerido pela margem e editável** (opção 1 da conversa).
- **Frete**: o Luis ainda vai confirmar como quer no financeiro. Até lá, ver 7.5.
- O Luis é dono da loja Shopify e cria o app no Dev Dashboard.
- **Canal novo "Shopify"**: hoje não existe; a migration cria (se não existir pelo nome), com envio ligado.
- **O Horus não marca o pedido como enviado na Shopify.** O Luis continua marcando lá, com o rastreio do
  Correios/Melhor Envio. O Horus só lê pedidos (sem escopo de escrita de fulfillment). Pedido marcado como
  enviado na Shopify **continua** em "A confirmar" até ser confirmado no Horus **(decisão do Claude)**.

## 7. Como funciona

### 7.1 Tipo de produto
- Tabela de tipos editável (tela de configuração), cada um com nome e **"pode vender em decant"**.
  Sementes: Perfume (decant: sim), Creme (não), Body splash (não) **(decisão do Claude** quanto às
  sementes**)**.
- `produtos` ganha o tipo. Todos os produtos que já existem viram **Perfume** na migration.
- Volume em ml continua obrigatório para todos.
- Produto de tipo sem decant: não aparece para abrir frasco nem em decants, e a publicação nos canais só
  oferece "unidade fechada". As categorias atuais (Masculino/Feminino/Unissex) ficam como estão.

### 7.2 Conexão com a Shopify
- App criado pelo Luis no **Dev Dashboard** da Shopify, na mesma organização da loja (senão o erro é
  `shop_not_permitted`). Client ID e Client secret vão para variáveis do projeto Vercel
  `horusparfum-control-api`, junto com o domínio `*.myshopify.com` da loja.
- Token: `POST https://{loja}/admin/oauth/access_token` com `grant_type=client_credentials`; dura ~24 h
  (`expires_in` 86399). O backend guarda o token e a validade e renova quando estiver perto de vencer
  **(conferido na doc em 17/11/2026)**.
- Chamadas pela **Admin GraphQL API** (versão fixada no código) **(conferir** nomes de mutations e
  escopos: produtos, inventário, pedidos, localizações**)**.
- Tela de configuração mostra "Conectado à loja X" e um botão para testar.

### 7.3 Ligar produtos existentes
- Tela "Ligar produtos da Shopify" (como `LigarAnuncios` do ML): lista os produtos e **cada variante**
  (opção) da loja, e o Luis liga cada uma a um item do Horus: **produto + frasco/unidade** ou **produto +
  decant de X ml**.
- Funciona se a loja tiver um produto com opções (Frasco 100 ml / Decant 5 ml...) **ou** um produto por
  tamanho, sem reorganizar a loja. **(decisão do Claude**; o Luis não disse como a loja está montada nem
  quantos produtos tem**)**.
- Variante sem ligação continua vendendo normalmente na Shopify; o Horus não mexe na quantidade dela.

### 7.4 Pedidos "a confirmar" (núcleo, neutro de canal)
- **Recebimento**: webhook de pedido criado/cancelado/reembolsado no backend, validado pela assinatura
  HMAC (`X-Shopify-Hmac-Sha256`, com o Client secret) **(conferir)**. Responde rápido e grava. Ao abrir a
  tela, o Horus busca pedidos recentes na Shopify para pegar o que faltou.
- **Sem duplicar**: cada pedido é único por (canal, id externo) no banco. Aviso repetido ou conferência
  não criam outro.
- **Pedido com pagamento pendente** (Pix/boleto não pago) **também reserva** **(decisão do Claude)**: a
  Shopify já baixa o estoque dela na criação do pedido; se o Horus não reservasse, a próxima sincronização
  devolveria a unidade à venda. Ele aparece na lista como "aguardando pagamento" e **não pode ser
  confirmado** até ser pago; se expirar ou for cancelado, sai e a reserva volta. **(conferir** quais
  webhooks/campos indicam pago e expirado**)**.
- **Data de corte** **(decisão do Claude)**: só entram pedidos criados **depois da conexão** com a Shopify
  (a data fica gravada na conexão). Pedidos anteriores já foram lançados à mão e não são importados, para
  não duplicar.
- **Reserva**: pedido na lista desconta da quantidade enviada a todos os canais, mas não baixa o estoque
  do Horus.
- Item com variante **não ligada**: o pedido entra assim mesmo, com o item marcado "escolha o produto";
  a confirmação exige escolher. Nunca descarta venda.
- Tela **Vendas › A confirmar** (uma lista para Shopify e, depois, ML; mostra o canal), funciona como lista
  do que embalar. Mostra cliente, itens, valor pago, frete, data.

### 7.5 Confirmar
- Usa o registro de venda que já existe (`registrar_venda`, com insumos e decant de várias origens), com
  canal Shopify, itens do pedido (preço pago por item, já com desconto), insumos de envio e:
  - **taxa** = `taxa_padrao` do canal Shopify × valor da venda **(decisão do Claude**: a Shopify não traz
    a taxa do gateway no pedido de forma simples; editável na confirmação**)**;
  - **frete** = o que o cliente pagou no pedido, **editável e zerável** na confirmação, até o Luis decidir
    a regra (vira configuração quando ele decidir).
- Na confirmação dá para **trocar o perfume** do decant e **abrir frasco lacrado** (design de Anúncios
  7.1/7.3). "Abrir frasco + registrar venda" precisa ser atômico.
- A receita entra no financeiro **na data da venda**, como hoje **(decisão do Claude**: o repasse da
  Shopify depende do gateway e não foi discutido**)**.
- A venda fica ligada ao pedido externo (para cancelamento e para não confirmar duas vezes).

### 7.6 Cancelamento e reembolso
- **Antes de confirmar**: o pedido sai da lista sozinho e a reserva volta.
- **Depois de confirmar**: o Horus **não estorna sozinho**; o pedido volta à lista como "cancelado na
  Shopify — desfazer venda?" e o Luis confirma o `cancelar_venda` que já existe.
- Reembolso parcial **(decisão do Claude)**: só alerta com o valor; o Luis ajusta pela edição de venda
  existente.

### 7.7 Sincronização de estoque Horus → canais
- Quantidade de cada item ligado (Shopify agora, ML depois), mesma regra do ML (design de Anúncios 7.3):
  - frasco/unidade: `estoque_atual − unidades reservadas`;
  - decant de X ml: `floor((ml aberto + estoque_atual × volume_ml − ml reservados) ÷ X)`; os tamanhos e o
    frasco cheio dividem o mesmo saldo.
- **O Horus manda**: a quantidade na Shopify é sobrescrita pela do Horus. A Shopify baixa sozinha na venda;
  em seguida o Horus regrava o valor calculado (que já desconta a reserva).
- Gatilho: **qualquer** mudança de estoque (venda manual, confirmação, pedido novo/cancelado, abrir
  frasco, consumo de decant, entrada de compra, ajuste manual). Hoje essas mudanças são RPCs chamadas
  direto do frontend; o plano escolhe o gatilho de modo que **nenhum caminho fique de fora** (ex.:
  Database Webhook do Supabase em `produtos`/`frascos_abertos` chamando o backend). Requisito: o canal
  reflete a mudança em poucos minutos.
- Botão "sincronizar tudo" na configuração, para corrigir qualquer diferença.
- Inventário da Shopify fica em **uma localização** (a da loja) **(decisão do Claude)**.

### 7.8 Publicar produto na Shopify
- No Horus, a partir do produto: escolher o que vender (unidade/frasco e, se o tipo permitir, tamanhos de
  decant da configuração de Anúncios), preço, fotos, título e descrição.
- Cria **um produto na Shopify com uma variante por item** (ex.: Frasco 100 ml / Decant 5 ml / Decant
  10 ml), já ligado no Horus e com a quantidade calculada.
- Reaproveita do módulo Anúncios: fotos (`produto_fotos`), textos (template/IA, sem emoji), e o padrão de
  rascunho → publicar sem duplicar.
- **Preço**: menor preço na grade `,90` que cumpre
  `preço × (1 − taxa_padrao do canal Shopify) ≥ custo × (1 + margem)`, com custo = custo do item + insumos
  do item + insumos de envio (mesma `custoAnuncio` do ML). Frete fora da conta (o cliente paga). Sugerido e
  editável.
- Variante adicionada depois a um produto já publicado (ex.: novo tamanho de decant): **(decisão do
  Claude)** fica para depois; nesta versão publica-se o conjunto de uma vez e liga-se o resto pela tela de
  ligar.

## 8. Critérios de sucesso
- Uma compra de teste na Shopify aparece em "A confirmar" em menos de um minuto, reduz a quantidade do
  mesmo item na Shopify, e confirmar em um clique deixa estoque, insumos e financeiro certos.
- O mesmo pedido avisado duas vezes, ou pego pela conferência, continua sendo uma venda só.
- Cancelar o pedido antes de confirmar devolve a quantidade na loja.
- Uma venda manual no WhatsApp reduz a quantidade na Shopify em poucos minutos.
- Um creme novo cadastrado no Horus vai para a Shopify sem abrir o painel da Shopify.

## 9. Em aberto com o Luis (não bloqueia o plano)
- Como o frete entra no financeiro (por enquanto: editável na confirmação).
- Como a loja está montada hoje e quantos produtos tem (a tela de ligar cobre os dois formatos).
- A taxa real do gateway da Shopify, para o `taxa_padrao` do canal.
- Criar o app no Dev Dashboard e cadastrar as variáveis na Vercel (passo a passo vai na doc da feature).

## 10. Fica para o construtor
- Nomes de tabelas, colunas, RPCs, rotas e componentes; layout das telas seguindo
  `docs/DESIGN_SYSTEM.md`. Sugestão: uma tabela de vínculos neutra de canal (produto, frasco/decant, ml,
  canal, ids externos) e uma de pedidos externos (canal, id externo único, status, itens, payload).
- Se a tabela `anuncios` do ML é generalizada para os vínculos ou fica separada.
- O gatilho exato da sincronização (7.7), respeitando "nenhum caminho de fora".
- Validar os itens **(conferir)** na doc da Shopify (Admin GraphQL, webhooks, HMAC, inventário).
- Testes: TDD nas libs de quantidade/reserva/preço; testes de RPC no padrão do projeto; teste do webhook
  com assinatura válida, inválida e repetida.
