# 🏷️ Anúncios (Mercado Livre)

## Visão Geral

Módulo que cria, publica e acompanha anúncios de perfumes (frasco lacrado e decant) no **Mercado Livre**, a partir do estoque do Horus. Terceiro módulo da nav (Financeiro / Estoque / **Anúncios**).

Parte 2 do módulo (spec: `docs/superpowers/specs/2026-11-16-anuncios-design.md`; plano: `docs/superpowers/plans/2026-11-16-anuncios.md`). A Parte 3 ("Vendas do ML": receber venda do ML e baixar estoque) ainda precisa de plano próprio.

> Migration `20261117100000_anuncios_schema.sql` aplicada no Supabase em 16/11/2026. Tabelas em [[BANCO]] (`anuncios`, `anuncios_config`, `ml_conexao`; `produtos.ficha`/`produtos.fotos`).

## Telas

| Rota | Página | O que faz |
|------|--------|-----------|
| `/anuncios` | `AnunciosLista` | Lista com status, preço, quantidade, qualidade; ações de quantidade, preço, pausar/reativar |
| `/anuncios/novo` | `NovoAnuncio` | Passo a passo: o que anunciar, ficha, fotos, preços, textos, publicar (`novo/*`) |
| `/anuncios/:id` | `NovoAnuncio` | Reabre um rascunho ou anúncio com erro |
| `/anuncios/ligar` | `LigarAnuncios` | Liga anúncios que já existem no ML a um perfume do Horus |
| `/anuncios/config` | `AnunciosConfig` | Conectar/desconectar o ML, margem padrão, IA, tamanhos de decant |

## Fluxo

1. **O que anunciar** (`OQueAnunciar`): escolhe o perfume, o tipo (frasco ou decant com os ml) e o tipo de anúncio (`gold_special` Clássico / `gold_pro` Premium). Cada combinação vira um rascunho em `anuncios`.
2. **Ficha** (`FichaPerfume`): atributos da categoria `MLB6284` (perfumes), salvos em `produtos.ficha`. Com IA ligada, "Sugerir" preenche a ficha.
3. **Fotos** (`FotosPerfume`): até 12, salvas em `produtos.fotos` e copiadas para o anúncio. Lembrete: a 1ª foto precisa de fundo branco.
4. **Preços** (`PrecosAnuncios`): o backend consulta comissão, taxa fixa e frete no ML e devolve o menor preço que fecha a margem. O `custo_base` do anúncio guarda o custo usado.
5. **Textos** (`TextosAnuncios`): título e descrição (template ou IA).
6. **Publicar** (`LateralPublicar`): `POST /api/anuncios/publicar`; mostra resultado por anúncio.

## Regra de preço

`preço − comissão − taxa_fixa − frete ≥ custo × (1 + margem)`

- O preço é o **menor** valor na grade `,90` que fecha a conta.
- **Degrau de R$ 79:** a partir de R$ 79 o frete grátis é obrigatório (o vendedor paga) e a taxa fixa deixa de existir; a busca testa `79,90` à parte para não pular a faixa. De R$ 19 a R$ 78,99 o ML paga o frete; abaixo de R$ 19 o Horus publica sem frete grátis.
- **Mínimo R$ 8:** o menor preço considerado é `8,90`.
- Preço a partir de R$ 79 exige peso e medidas do kit de envio; sem eles o erro é "Preencha peso e medidas do kit de envio".
- Código: `backend/app/services/anuncios/preco.py` (`calcular_preco`, `consulta_ml`); custo do anúncio em `frontend/src/lib/anuncios.ts`.

## Regra de quantidade

- **Frasco** = `produtos.estoque_atual` (lacrados).
- **Decant** = `floor((ml aberto + lacrados × volume_ml) ÷ ml do decant)`, onde ml aberto é a soma de `ml_restante` dos `frascos_abertos` ativos.
- Código: `quantidade_disponivel` em `services/anuncios/publicar.py` e `quantidadeDisponivel` em `lib/anuncios.ts`.

## `family_name` x `title`

Contas do ML em **User Products** exigem `family_name` e rejeitam `title`; contas antigas usam `title`. O Horus lê isso na conexão (`ml_conexao.user_product`) e `montar_item` envia `family_name` ou `title` conforme o caso (o texto vem do mesmo campo `anuncios.titulo`).

## Limites do ML

| Limite | Valor |
|--------|-------|
| Fotos por anúncio | 12 |
| Título (`family_name`/`title`) | 150 caracteres |
| Preço mínimo | R$ 8 |
| Frete grátis obrigatório | a partir de R$ 79 |

Decant nunca leva o GTIN do frasco: vai com `EMPTY_GTIN_REASON` (`17055160`). Frasco sem código de barras gera aviso (perde nota), não bloqueia.

## O que o Horus muda depois de publicar

- **Quantidade:** botão na lista (`POST /api/anuncios/{id}/quantidade`) recalcula pela regra acima e envia ao ML.
- **Preço:** só muda quando você clica "Aplicar preço" (`POST /api/anuncios/{id}/preco`); a lista avisa quando o custo mudou desde a publicação.
- **Pausar/reativar:** `POST /api/anuncios/{id}/status`.
- **Qualidade:** `GET /api/anuncios/{id}/qualidade` lê a nota do ML e as pendências.
- Título, fotos e ficha **não** são alterados pelo Horus depois de publicar.

## IA (opcional)

Claude Haiku (`claude-haiku-5-5`, `services/anuncios/ia.py`) sugere a ficha e escreve título e descrição. Só funciona com `anuncios_config.ia_ativa` ligado **e** `ANTHROPIC_API_KEY` no backend; sem isso as rotas `/api/anuncios/ia/*` respondem `409 IA desligada` e o frontend usa o template de texto.

## Checklist de ativação

1. O Luis cria o app em `https://developers.mercadolivre.com.br/devcenter` com:
   - redirect URI: `https://horusparfum-control-api.vercel.app/api/mercadolivre/callback`;
   - escopos de leitura, escrita e `offline_access`;
   - PKCE desligado.
2. No projeto Vercel `horusparfum-control-api`, o Luis cadastra no painel (nunca colar em chat): `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` (igual ao redirect acima) e, opcional, `ANTHROPIC_API_KEY`.
3. Deploy do backend: `npx vercel login` e `npx vercel --prod` dentro de `backend/`. O frontend publica sozinho no push para a `main`.
4. Em **Anúncios › Configuração**: **Conectar** ao Mercado Livre, definir a **margem padrão** e preencher **peso e medidas** dos kits de envio em **Estoque › Insumos › Kits por venda** (envio de frasco e de decant).

## Limites conhecidos

- A busca de anúncios existentes (`/api/anuncios/conta/itens`) para em 1000 itens (limite da busca comum do ML).
- Anúncios ligados por "Ligar" não têm `custo_base`, então não recebem o aviso "custo mudou".
- A sincronização de quantidade é manual (botão) até a Parte 3.
- O ML não tem chave de idempotência na criação: se a rede falhar ao publicar, o anúncio fica com erro e a mensagem pede conferir no ML antes de tentar de novo.
- O refresh token do ML é de uso único; uma renovação simultânea é tratada em `services/mercadolivre/cliente.py`, mas se a conexão cair basta reconectar.

## Arquivos

- Backend: `routers/mercadolivre.py`, `routers/anuncios.py`, `services/mercadolivre/{cliente,conexao}.py`, `services/anuncios/{preco,ia,publicar}.py`.
- Frontend: `pages/anuncios/*`, `lib/anuncios.ts`, `lib/apiAnuncios.ts`.
- Rotas da API: [[API]].
