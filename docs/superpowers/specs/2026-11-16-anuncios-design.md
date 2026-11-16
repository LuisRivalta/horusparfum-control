# Design — Módulo Anúncios (Mercado Livre) + Insumos

> Brainstorming de 12 a 16/11/2026 com o Luis. Este documento é o que foi decidido na conversa.
> Onde está escrito **(decisão do Claude)**, a escolha foi minha e não foi validada pelo Luis.
> Fatos marcados **(conferido)** foram vistos na API ou na documentação oficial do ML durante a conversa;
> **(conferir)** é conhecimento prévio que o plano deve validar antes de codar.

## 1. Por que existe

A Horus vende perfumes (frasco cheio) e decants no Mercado Livre: publica o anúncio, o cliente compra, a
Horus envia pelos Correios **com a etiqueta do ML (Mercado Envios)** — confirmado pelo Luis. A dor é **subir anúncio por anúncio depois de cada compra**: fotos, título,
descrição, características, preço. Hoje também nenhuma venda do ML entra no Horus: estoque e Financeiro
ficam desatualizados, e a quantidade dos anúncios é mexida à mão.

O módulo resolve três coisas:
1. **Criar anúncios rápido**, já com o preço certo (margem real depois das taxas do ML) e a maior nota de
   qualidade possível no ML.
2. **Trazer as vendas do ML para o Horus**, baixando estoque, insumos e lançando no Financeiro.
3. **Manter a quantidade dos anúncios certa** no ML conforme o estoque do Horus.

Para o preço ser real, o Horus precisa saber o custo dos **insumos** (frasquinho, saquinho, adesivo, caixa
de envio...). Hoje só existe um custo fixo de embalagem por tamanho de decant (`embalagens_decant`), sem
estoque. Por isso o módulo vem com um controle de insumos, que também serve às vendas fora do ML.

## 2. Ordem de construção

São três partes. Cada uma vira um plano próprio (superpowers:writing-plans), nesta ordem:

1. **Insumos** — cadastro, compras, listas por tipo de item, baixa automática nas vendas e decants, e
   decant de 2,5 ml.
2. **Anúncios** — conexão com a conta do ML, ficha do perfume, fotos, cálculo de preço, criação e
   publicação, nota de qualidade, ligar anúncios antigos, aviso de preço sugerido.
3. **Vendas do ML** — receber pedidos, lista "a confirmar", troca de perfume, abrir frasco lacrado,
   reserva, cancelamento, sincronização de quantidade Horus → ML, valor a receber no Financeiro.

**(decisão do Claude)** A sincronização de quantidade fica na parte 3 porque depende da reserva dos pedidos
não confirmados. Entre a parte 2 e a 3, o anúncio publica com a quantidade do momento e a tela de anúncios
tem um botão "atualizar quantidade no ML".

## 3. Metas, não-metas e anti-metas

**Metas**
- Criar os 4 anúncios de um perfume (frasco + decants 2,5/5/10 ml) em menos tempo do que o Luis leva hoje
  para criar **um** no site do ML. **(decisão do Claude: a meta exata de tempo não foi medida.)**
- Todo anúncio chega ao nível **Profissional** quando possível; quando não der, a **maior nota possível**.
- A margem escolhida é a que **sobra de verdade** depois de comissão, taxa fixa e frete pago pelo vendedor.
- Nenhuma venda do ML fica fora do Horus.
- O ML nunca mostra quantidade maior do que a Horus tem.

**Não-metas (fora desta versão)**
- Gerar ou editar imagem. O Luis sobe as fotos prontas (algumas ele faz com Gemini/ChatGPT por fora).
- Site próprio e outros marketplaces. O modelo de dados fica neutro de canal (reaproveita `canais`), mas só
  o ML é implementado.
- Perguntas de compradores, promoções, Mercado Ads, Full, vídeo, mais de uma conta do ML.
- Devolução/reclamação do ML **(decisão do Claude)**: nesta versão, devolução se resolve cancelando a venda
  na tela de Vendas que já existe. Cancelamento de pedido entra (parte 3).
- Perda estimada embutida no custo dos insumos; insumo "sem controle de estoque".
- **Kits** (anúncio com mais de um perfume ou tamanho: kit de 3 decants, "escolha a fragrância", frasco +
  decant). O Luis pretende ter, mas não tem hoje. **(decisão do Claude)** Nesta versão cada anúncio é um
  produto num tipo/tamanho; a conversão "pedido do ML → itens da venda" fica num único ponto do código,
  para que kits entrem depois acrescentando a lista de componentes, sem reescrever o fluxo.

**Anti-metas (se acontecer, o módulo falhou mesmo funcionando)** — palavras do Luis:
- **Criar o anúncio demorar mais** do que direto no ML.
- **Faltar opção que só existe lá** e ele ter que ir ao ML completar todo anúncio.

Derivadas **(decisão do Claude)**:
- O Horus desfazer o que o Luis mudou direto no ML. Depois de publicar, o Horus só mexe em **quantidade,
  preço (quando o Luis manda) e pausa/reativação**.
- Preço mudar sozinho. Quando o custo muda, o Horus **só avisa** (decidido pelo Luis).
- Baixa errada e silenciosa de estoque — por isso toda venda do ML passa por confirmação.

## 4. Restrições

- **Segredos só no backend**: client secret do app do ML, tokens de acesso/renovação, chave da API de IA,
  service role do Supabase. Nada disso vai para o frontend nem para tabela legível pelo papel
  `authenticated`.
- **SQL do Horus é aplicado à mão no SQL Editor do projeto Horus** (`wyobbztexoofhqdttxzq`). O MCP do
  Supabase conectado nesta máquina aponta para **outro** projeto e não deve ser usado para o Horus.
- Backend é FastAPI no **Vercel Python Runtime** (serverless): sem processo residente; trabalho
  periódico só por webhook, por chamada do frontend ou por cron da Vercel.
  Deploy do backend exige `npx vercel login` antes de `npx vercel --prod`.
- Padrão do projeto: operações atômicas em RPC PL/pgSQL; cálculo de prévia em `frontend/src/lib/*.ts`
  com `decimal.js`, espelhando a RPC; `formatBRL()` para dinheiro; TDD nas libs.
- RLS do projeto é "autenticado tem acesso total". Exceção obrigatória: a tabela de tokens do ML
  (ver "Conexão com o ML" em 6.4) só é acessível pelo service role.
- Regra de auditoria da máquina do Luis (CLAUDE.md global): todo script/executável criado, modificado ou
  excluído é registrado com `Registrar-Auditoria__Claude_Code_MS125_luisgfr.ps1`. Módulos `.py`/`.ts` do
  projeto mantêm o nome que o import exige; só o registro é obrigatório.
- PC com antivírus corporativo: alguns hosts exigem `curl --ssl-no-revoke`. Nada de processo oculto ou
  agendado na máquina.

## 5. Parte 1 — Insumos

### 5.1 O que o Luis decidiu
- Cada insumo é **cadastrado uma vez pelo sistema** (nome, estoque, custo). **Nada vem pronto**: nem
  insumos, nem listas. Ele ainda vai definir o que usa.
- **Compra**: informa quantidade e valor total (ex.: 1000 frasquinhos por R$ 2.000 → R$ 2,00 cada). O
  custo vira **média ponderada** com o saldo, como o Horus já faz com perfume.
- **Na compra, o Horus pergunta "quantos sobraram?"**, com o campo **já preenchido** com o saldo do
  sistema. Confirmar sem mexer = segue igual. Corrigir = a diferença é lançada como **perda** e a compra
  soma em cima do saldo corrigido. Existe também um botão **"acertar estoque"** opcional, a qualquer hora.
- **Todo insumo tem estoque contado**, sem exceção para os baratos (recomendação aceita).
- **Duas listas**, definidas pelo sistema:
  - **por item**: o que vai em cada decant (por tamanho) e em cada frasco cheio;
  - **por envio**: caixinha, etiqueta, fita... conta **uma vez por venda**. O **frasco cheio tem envio
    próprio** (caixa diferente).
- Decants são **enchidos na hora da venda**: a baixa dos insumos acontece **na venda**.
- Na venda e no brinde, a **lista de insumos aparece preenchida e editável** antes de confirmar
  (pedido grande e raro que pede mais caixas; brinde que vai junto com pedido ou entregue em mãos).
- **Tamanhos de decant: 2,5 ml, 5 ml e 10 ml.**

### 5.2 Decisões do Claude (não validadas)
- Insumos ficam como aba própria em **Estoque** ("Insumos"), não dentro de Anúncios, porque servem a
  qualquer venda. As listas (por item e por envio) ficam na mesma aba.
- Compra de insumos lança **despesa** em `transacoes` (categoria "Insumos", `origem` nova `'insumo'`).
- Cada insumo tem **estoque mínimo**; o Horus avisa quando ficar abaixo (mesmo padrão de `produtos`).
- Venda com frasco cheio usa a **lista de envio do frasco**; só decants usa a **lista de envio de decant**.
  A tela sugere e o Luis troca.
- Se a lista de envio entra ou não depende do **canal**: cada canal ganha um campo "usa envio"
  (ex.: ML e Site sim, Loja física não). Default editável na tela da venda.
- Decant não faturável (perda, amostra, brinde...) baixa a lista **por item**, não a de envio, salvo se o
  Luis acrescentar na hora. Classificação `perda` não baixa insumo (consistente com hoje: perda não tem
  embalagem).
- **Cancelar venda devolve os insumos** ao estoque (estorno simétrico). Se algo se perdeu, acerta na
  próxima compra.
- O custo dos insumos **por item** vai para `venda_itens.custo_embalagem` (que passa a significar "custo
  de insumos do item"). O custo do **kit de envio** é custo da venda e entra no lucro (`vendas.lucro_bruto`)
  — o plano escolhe onde guardar (ex.: coluna nova em `vendas`).
- `embalagens_decant` é substituída pelas listas por tamanho. O plano define a migração (as telas
  `VendasConfig`, `VendaFormModal`, `DecantModal` hoje leem dela).

### 5.3 Ponto técnico que o plano precisa resolver: 2,5 ml
Hoje `ml` é `int` em `decants.ml`, `venda_itens.ml`, `frascos_abertos.ml_total/ml_restante` e
`embalagens_decant.tamanho_ml`, e as RPCs `registrar_venda`, `editar_venda`, `cancelar_venda`,
`registrar_consumo_decant` fazem cast para `int`. **Decant de 2,5 ml não cabe.** O plano precisa migrar
essas colunas para `numeric` (ex.: `numeric(6,1)`) e ajustar as RPCs e as libs `decants.ts`/`vendas.ts`.

### 5.4 Decant que sai de mais de um frasco (decidido pelo Luis)
Quando o frasco aberto tem menos do que o decant precisa (ex.: sobraram 4 ml e saiu um de 10 ml), o Luis
**completa com um frasco novo do mesmo perfume, ou com um perfume similar/idêntico avisando o cliente**.
Logo, um decant pode ter **mais de uma origem** (frasco + ml de cada).

Hoje cada decant aponta para um frasco só (`decants.frasco_id`, `venda_itens.frasco_id`), e o índice
`frascos_abertos_ativo_unico` só permite um frasco ativo por perfume. Requisitos para o plano (feito na
parte 1, junto com a mudança para 2,5 ml, porque mexe nas mesmas colunas e RPCs):
- O decant guarda a lista de origens (frasco, perfume, ml, custo de cada); custo do decant = soma.
- Completar com frasco novo do mesmo perfume: na mesma operação atômica, consome o resto do frasco
  aberto (fica `esgotado`), abre um lacrado (tira 1 do estoque) e tira o restante dele. Assim continua
  valendo "um frasco ativo por perfume".
- Completar com outro perfume: tira o restante do frasco aberto do perfume escolhido.
- Vale para venda de qualquer canal, para a confirmação de venda do ML e para decant não faturável.
- `cancelar_venda`/`editar_venda` devolvem os ml a cada origem sem quebrar a regra de um frasco ativo por
  perfume (o plano decide como tratar devolução para um frasco que ficou `esgotado`).

### 5.5 Modelo de dados sugerido (o plano pode ajustar)
- `insumos` (id, nome, unidade, estoque_atual numeric, estoque_minimo, custo_medio, ativo, created_at)
- `insumo_movimentacoes` (id, insumo_id, tipo: compra | consumo | perda | acerto | estorno, quantidade,
  custo_unitario, venda_id?, decant_id?, responsavel, created_at) — ledger, como `movimentacoes`.
- `insumo_listas` (id, tipo: `decant` | `frasco` | `envio_decant` | `envio_frasco`, tamanho_ml? para
  decant) e `insumo_lista_itens` (lista_id, insumo_id, quantidade).
- **Peso e medidas do pacote nas listas de envio** **(decisão do Claude)**: cada lista de envio guarda
  peso (g) e altura/largura/comprimento (cm) do pacote montado — um para decant, um para frasco. É o que o
  Mercado Envios usa para cobrar o frete do vendedor (parte 2, cálculo do preço). Se algum frasco grande
  sair muito diferente, o plano pode acrescentar um ajuste opcional por produto depois.
- RPC `registrar_compra_insumo(insumo, qtd, valor_total, saldo_contado, responsavel)`: perda pela
  diferença, compra, custo médio, despesa no Financeiro — atômica.
- `registrar_venda` / `editar_venda` / `cancelar_venda` / `registrar_consumo_decant` passam a receber a
  lista final de insumos (já editada pelo usuário) e baixam/estornam no mesmo transação.

## 6. Parte 2 — Anúncios

### 6.1 O que o Luis decidiu
- Módulo novo no menu principal, ao lado de Financeiro e Estoque, chamado **Anúncios**.
- Fluxo (tela aprovada no esboço — seção 6.3): digita o nome do perfume → o Horus acha o produto
  cadastrado (avisa se não achar) → monta os anúncios → ele confere, põe/ordena as fotos → publica.
- O perfume **já está cadastrado** no Horus; custo, marca, volume e estoque vêm de lá.
- **Preço do frasco** = custo do perfume (custo médio) + insumos do frasco + margem.
  **Preço do decant** = (custo do frasco ÷ ml do frasco × ml do decant) + insumos do tamanho + margem.
  Exemplo do Luis: frasco de 100 ml a R$ 180 → decant de 10 ml = R$ 18 + R$ 3 (frasquinho) + R$ 4
  (embalagens) = R$ 25; margem 60% sobre o custo → R$ 40.
- A margem é **sobre o custo** e tem que **sobrar depois das taxas do ML** (o preço sobe para cobrir
  comissão, taxa fixa e frete). Existe **margem padrão** na configuração, **alterável por anúncio**.
  Os valores do exemplo são ilustrativos; os reais o Luis configura.
- **IA via API com modelo barato** (não precisa ser Claude), **opcional** (liga/desliga). Sem IA, o texto
  sai de modelo fixo ou ele escreve.
- **Descrição**: as regras/modelo serão definidas depois → campo **"modelo de descrição"** na
  configuração. Vazio = descrição simples montada com os dados da ficha.
- **Ficha do perfume** salva no produto e reaproveitada nos 4 anúncios (e no site no futuro). A IA sugere
  e o Luis confere.
- **Fotos** guardadas no perfume; cada foto marcada **frasco** ou **decant**; ordem definida uma vez. O
  frasco usa as de frasco; os decants usam as mesmas **mais uma ou duas de decant**. Padrão de fotos do Luis
  (contexto): 1ª fundo branco (exigência do ML), 2ª frasco com fundo, 3ª frasco + decant, 4ª notas,
  5ª pirâmide olfativa...
- **Tipo de anúncio (Clássico/Premium) por anúncio**, com padrão na configuração. A tela mostra **os dois
  lado a lado** (preço e lucro).
- Quando o custo de um perfume (ou de insumo) muda, o Horus **só avisa** que o preço sugerido mudou; não
  troca sozinho.
- **Meta de qualidade**: Profissional sempre que der; senão, a maior nota possível. Se o decant perder
  ponto por não ter código de barras, aceita.
- Anúncios **já existentes no ML** são ligados aos produtos do Horus por uma tela de "ligar anúncios".

### 6.2 Fatos do ML levantados na conversa
- Categoria de perfume: preditor `GET /sites/MLB/domain_discovery/search?q=perfume lattafa afeef` →
  domínio `MLB-PERFUMES`, categoria **`MLB6284`** **(conferido)**.
- `GET /categories/MLB6284/attributes` **(conferido)**:
  - obrigatórios: `BRAND`, `PERFUME_NAME`, `UNIT_VOLUME` (number_unit, mL);
  - `GTIN` obrigatório condicional; `EMPTY_GTIN_REASON` (oculto) para quem não tem código — caso do decant;
  - opcionais: `LINE`, `VERSION`, `GENDER`, `PERFUME_TYPE` (EDP, EDT, Elixir, Body splash...),
    `IS_REFILLABLE`, `OLFACTORY_NOTES`, `OLFACTORY_FAMILIES`, `ORIGIN_COUNTRY`, `APPROXIMATE_DURATION`,
    `RELEASE_YEAR`, `IS_CRUELTY_FREE`, `IS_VEGAN`, `IS_ALCOHOL_FREE`, `IS_SET`, `INCLUDES_CASE`,
    `ANVISA_PRIOR_NOTIFICATION_COMMUNICATION_DOCUMENT_NUMBER`, `CONAMA_LICENSE_NUMBER`;
  - **nenhum atributo com `allow_variations`** → **cada tamanho de decant é um anúncio separado**
    (o Luis vai confirmar olhando os anúncios atuais).
- `GET /categories/MLB6284` **(conferido)**: `max_pictures_per_item` 12, `max_title_length` 150,
  condições `new`/`not_specified`.
- **Não existe rascunho na API** **(conferido)**: rascunho vive no Horus.
- Publicação: `POST /items`, fotos por URL pública (`pictures: [{source}]`); imagem é obrigatória em
  `gold_special` (erro 173) **(conferido)**. Descrição em `POST /items/{id}/description` **(conferir)**.
- Alterar quantidade: `PUT /items/{id}` com `available_quantity` **(conferido)**; pausar/reativar:
  `PUT /items/{id}` com `status` **(conferido)**.
- Qualidade: `GET /item/{id}/performance` → `score` 0–100, `level_wording` (MLB: Básica, Satisfatória,
  Profissional) e `buckets` (CHARACTERISTICS, PICTURES, OFFER...) com regras `PENDING`/`COMPLETED`,
  texto e link de correção **(conferido)**. A API antiga `/health` foi descontinuada.
- Taxas por preço e tipo: `GET /sites/MLB/listing_prices?price=&category_id=&listing_type_id=`
  **(conferir)**. Custo do frete grátis pago pelo vendedor: endpoint de shipping options do usuário
  **(conferir)**. Acima de certo valor o frete grátis é obrigatório e o vendedor paga parte; abaixo, o
  comprador paga o frete **(conferir os limites atuais)**.
- Bucket `produtos` do Supabase é público → as URLs das fotos servem direto para o ML. O `ImageCropper`
  não reduz a resolução (canvas do tamanho do recorte), o que preserva fotos ≥ 1200 px.

### 6.3 Tela "Novo anúncio" (esboço aprovado pelo Luis: "a lógica ficou top")
Uma página só, de cima para baixo, com uma coluna lateral fixa:
1. **Perfume** — busca pelo nome; mostra o produto achado, estoque de lacrados, ml do frasco aberto,
   custo médio.
2. **O que anunciar** — Frasco + Decant 2,5 / 5 / 10 ml, todos marcados por padrão; tipo padrão
   (Clássico/Premium).
3. **Ficha do perfume** — cada campo mostra a origem: **Horus** (marca, volume), **pedido** (código de
   barras), **IA · confira** (gênero, tipo, notas, famílias, país...). Todos os atributos que o ML aceita
   para a categoria aparecem, vindos da API, não de lista fixa.
4. **Preço** — uma linha por anúncio: custo (perfume ou ml + insumos do item + 1 kit de envio), margem
   editável, **Clássico e Premium lado a lado** com preço e lucro; escolhe um.
5. **Fotos** — galeria do perfume com marca frasco/decant, arrastar para ordenar, subir novas; mostra
   quais entram em cada anúncio (máx. 12).
6. **Título e descrição** — título por anúncio (decants iguais mudando o volume), descrição do modelo;
   botões "Gerar com IA" e "Usar modelo sem IA".
- **Lateral**: checagem antes de publicar (ficha completa, nº de fotos e 1ª com fundo branco, código de
  barras no frasco, títulos no limite, descrição); estoque que vai para cada anúncio; botões
  **Publicar N anúncios** e **Salvar rascunho**; depois de publicar, **nota do ML** e pendências com
  link "abrir no ML".

Esboço HTML de referência: arquivo `novo-anuncio.html` gerado na sessão (pasta `.superpowers/brainstorm`
da scratchpad; não versionado).

### 6.4 Decisões do Claude (não validadas)
- **Abas do módulo**: Anúncios (lista + novo), Vendas do ML (parte 3), Configuração (conexão com o ML,
  margem padrão, tipo padrão, modelo de descrição, IA liga/desliga, tamanhos de decant ativos).
- **Lista de anúncios**: por anúncio, perfume, tipo (frasco / decant X ml), preço, quantidade, status no
  ML, **nota e nível**, aviso "preço sugerido mudou: R$ X → R$ Y" com botão "aplicar".
- **Cálculo do preço**: achar o menor preço que deixa `preço − comissão − taxa fixa − frete do vendedor ≥
  custo × (1 + margem)`. As taxas mudam por faixa de preço (há degrau no limite do frete grátis), então o
  cálculo consulta as taxas no preço candidato e itera; a prévia é feita no backend (a API do ML exige
  token). O frete do vendedor (Mercado Envios) é calculado com o peso e as medidas da lista de envio
  (5.5). Arredondamento final para **,90** (como no esboço).
- **Título**: modelo por regra, editável — frasco: "Perfume {Marca} {Nome} {Tipo} {ml}ml {Gênero}";
  decant: "Decant {Marca} {Nome} {TipoAbrev} {ml}ml {Gênero}". A IA pode reescrever se ligada. Limite da
  categoria: 150 caracteres.
- **Ficha**: guardada no produto como `jsonb` chaveado pelo id do atributo do ML (`BRAND`, `GENDER`...)
  + coluna de código de barras em `produtos`. Decant usa `EMPTY_GTIN_REASON`.
- **IA**: chamada só pelo backend; um provedor, escolhido no plano pelo menor custo que gere texto bom em
  português; chave em variável de ambiente; se a IA falhar ou estiver desligada, cai no modelo sem IA.
  A IA nunca publica: só preenche campos que o Luis confere.
- **Fotos**: tabela `produto_fotos` (produto_id, url, uso `frasco`|`decant`, ordem). O `foto_url` atual do
  produto continua sendo a capa no resto do Horus (vira a primeira foto da galeria na migração).
- **Rascunho**: tabela de anúncios do Horus com status `rascunho` | `publicado` | `pausado` | `erro`,
  guardando o id do anúncio no ML, canal (`canais`), produto, tipo (frasco/decant + ml), preço, tipo de
  anúncio, margem usada, título, descrição.
- **Publicar** cria os N anúncios no ML em sequência; falha num deles não desfaz os outros: o que falhou
  fica em `erro` com a mensagem do ML e botão "tentar de novo".
- **Ligar anúncios existentes**: o Horus lista todos os anúncios da conta, sugere o produto pelo título
  (reaproveita o matcher de `frontend/src/lib/pedidoPdfImport.ts`) e o tipo pelo volume do anúncio
  (`UNIT_VOLUME` menor que o volume do produto = decant daquele tamanho). O Luis confirma ou corrige, uma
  vez por anúncio. Esses anúncios passam a mostrar nota e a sincronizar quantidade.
- **Conexão com o ML**: o Luis cria o app no portal de desenvolvedores do ML; redirect URI no backend
  (ex.: `https://horusparfum-control-api.vercel.app/api/mercadolivre/callback`); tokens renovados pelo
  backend quando expiram **(conferir duração e rotação do refresh token)**.

## 7. Parte 3 — Vendas do ML

### 7.1 O que o Luis decidiu
- Aba **Vendas do ML** com lista que **vai crescendo conforme as vendas saem**, em **tempo real**; cada
  venda entra uma vez e sai da lista quando confirmada (vai para o histórico de Vendas).
- **Toda venda do ML exige confirmação manual** antes de baixar estoque.
- Na confirmação dá para **trocar o perfume** usado no decant (ex.: vendeu 5 ml de Supremacy que acabou,
  combinou com o cliente e mandou outro similar). O Horus baixa os ml do frasco aberto do perfume que foi
  de verdade e usa o custo dele; a venda continua ligada ao anúncio original.
- **Decant de perfume sem frasco aberto, só lacrado**: a confirmação oferece **abrir um frasco lacrado** e
  já tirar o decant dele.
- No resto, o decant consome do **frasco aberto da aba Decants**.
- A lista funciona como **lista do que embalar**: confirma na hora de montar o pacote.
- **Reserva**: venda não confirmada ainda não baixa o estoque do Horus, mas já é descontada da
  quantidade enviada ao ML.

### 7.2 Fatos do ML levantados
- Notificação de pedidos no tópico `orders_v2` **(conferido)**; o pedido traz `order_items[].sale_fee`
  (comissão) e `listing_type_id` **(conferido)**.
- Data de liberação do dinheiro: vem do pagamento (`money_release_date`) **(conferir)**.

### 7.3 Decisões do Claude (não validadas, exceto onde dito)
- **Recebimento**: endpoint de notificações no backend recebe o aviso do ML, responde rápido e grava o
  pedido; ao abrir a aba, o Horus também busca pedidos recentes para pegar o que faltou.
- **Frasco cheio também passa pela confirmação** (uma regra só; troca também pode acontecer).
- Pedido **cancelado** no ML: se ainda não confirmado, sai da lista com aviso; se já confirmado, volta à
  lista como "cancelado no ML — desfazer venda?" e o Luis confirma o `cancelar_venda`.
- **Confirmar** chama o fluxo de venda existente (`registrar_venda`) com canal Mercado Livre, comissão
  real (`sale_fee`) como taxa, frete pago pelo vendedor como frete, `frasco_id` do perfume escolhido e a
  lista de insumos editada. "Abrir frasco lacrado + registrar venda" precisa ser **atômico** (hoje abrir
  frasco é feito direto do frontend em `AbrirFrascoModal`, sem RPC) → RPC nova ou extensão da existente.
- **Financeiro**: a receita entra como **valor a receber na data de liberação do ML**, não no dia da
  venda (proposto na conversa; o Luis respondeu "boa"). Hoje `registrar_venda` lança a entrada em
  `transacoes` na hora; o plano define como lançar em `contas`/`conta_parcelas` (tipo receber,
  vencimento = liberação) sem duplicar a entrada.
- **Sincronização de quantidade Horus → ML** depois de qualquer mudança de estoque (venda de qualquer
  canal, recebimento de pedido, abrir frasco, consumo de decant, entrada/saída manual):
  - anúncio de frasco: `estoque_atual − reservas de frasco`;
  - anúncio de decant de X ml: `floor((ml_restante do frasco ativo + estoque_atual × volume_ml −
    ml reservados) ÷ X)` — os tamanhos dividem o mesmo saldo, e o frasco cheio também consome dele;
  - quantidade 0 → pausa; voltou estoque → reativa (só anúncios que o Horus pausou).
  - Regra do Luis, que a fórmula já cumpre: se o perfume tem, por exemplo, 5 ml no frasco aberto e
    **nenhum lacrado de reserva**, o anúncio de 10 ml é **desativado** e ficam só os de 5 e 2,5 ml.
    Somar aberto + lacrados num saldo só vale porque o Luis completa decant com frasco novo (5.4). O ml de
    perfume similar usado em troca **não** entra no saldo do anúncio.
  As mudanças de estoque hoje acontecem direto do frontend no Supabase (RPCs), não pelo backend; o plano
  escolhe o gatilho (ex.: Database Webhook do Supabase chamando o backend, ou o frontend chamando o
  backend depois de cada ação). Requisito: o ML refletir a mudança em poucos minutos.

## 8. Critérios de sucesso
- O Luis cria os anúncios de um pedido novo (ex.: os 13 perfumes novos do pedido do Brás) sem entrar no
  site do ML.
- Anúncios publicados pelo Horus aparecem como Profissional (ou com a maior nota possível) e a tela
  mostra o que falta.
- O lucro mostrado na criação bate com o lucro registrado na venda (mesmas taxas e custos).
- Vendas do ML aparecem na lista em minutos, são confirmadas em um clique quando não há troca, e estoque,
  insumos e Financeiro ficam certos.
- Nenhuma venda a descoberto por quantidade desatualizada no ML.

## 9. Em aberto com o Luis (não bloqueia o plano)
- Lista real de insumos e o que vai em cada pacote (ele vai conferir e cadastrar pelo sistema).
- Modelo de descrição (ele define depois, no campo da configuração).
- Confirmar nos anúncios atuais que decant é um anúncio por tamanho.
- Valores de margem padrão, de insumos e peso/medidas dos pacotes.

## 10. Fica para o construtor
- Nomes de tabelas, colunas, RPCs e endpoints; divisão de componentes; layout fino das telas seguindo
  `docs/DESIGN_SYSTEM.md`.
- Escolha do provedor/modelo de IA (barato, bom em português, chave no backend).
- Validar os itens **(conferir)** da seção 6.2 e 7.2 na documentação do ML antes de codar.
- Estratégia de testes (TDD nas libs de cálculo de preço, insumos e quantidade; testes de RPC no padrão do
  projeto).
