# Dashboard de vendas e ROI

> Data: 2026-06-23  
> Status: aprovado para planejamento  
> Escopo: dashboard analitico de vendas calculado no backend FastAPI

## Contexto

O modulo de Vendas ja registra venda, itens, canal, custo, taxa, frete, lucro e status. A tela atual `/estoque/vendas` funciona como lista operacional: criar venda, abrir detalhes e cancelar. Falta uma visao gerencial para responder quais vendas, produtos e canais geram mais resultado.

O usuario escolheu calcular o dashboard no backend, seguindo o mesmo padrao dos relatorios financeiros: endpoint protegido por JWT, consulta Supabase com service role no servidor e calculo monetario com `Decimal`.

## Objetivo

Adicionar uma aba **Dashboard** dentro de `/estoque/vendas` para analisar faturamento, lucro, margem e ROI por periodo, produto e canal.

## Fora de escopo

- Criar novas tabelas, views ou RPCs.
- Alterar o fluxo de registrar/cancelar venda.
- Exportar PDF nesta primeira entrega.
- Incluir vendas manuais do financeiro que nao passaram pelo modulo de Vendas.
- Processar pagamento ou integrar marketplace.

## Navegacao e UX

A rota `/estoque/vendas` passa a ter duas abas:

- **Lista**: tela atual, mantendo botoes "Nova venda" e "Canais e embalagens".
- **Dashboard**: nova visao analitica.

O item da sidebar continua sendo apenas **Vendas**. Nao sera criado novo item de menu.

O periodo padrao do dashboard sera o mes atual. O seletor permite:

- Mes
- Trimestre
- Ano
- Personalizado

O comportamento visual deve seguir os padroes existentes de `PeriodSelector`, cards premium e tabelas do projeto.

## Endpoint

Criar:

```http
GET /api/estoque/vendas/dashboard?inicio=<iso>&fim=<iso>
Authorization: Bearer <Supabase JWT>
```

Validacoes:

- `inicio` e `fim` devem ser ISO-8601 validos.
- `inicio <= fim`.
- Token JWT obrigatorio via `get_current_user`.
- Em erro de consulta Supabase, retornar `502`.
- Em periodo invalido, retornar `400`.

## Dados consultados

O backend consulta:

- `vendas`: `id`, `numero`, `status`, `data_venda`, `total_bruto`, `total_custo`, `lucro_bruto`, `taxa_total`, `frete`, `canal_id`, `created_at`
- `canais`: `id`, `nome`
- `venda_itens`: `id`, `venda_id`, `tipo`, `produto_id`, `quantidade`, `ml`, `preco_unitario`, `custo_unitario`, `custo_embalagem`, `taxa_rateada`, `frete_rateado`, `lucro`
- `produtos`: `id`, `nome`

O filtro de periodo usa `vendas.data_venda`, nao `created_at`, porque o usuario pode registrar uma venda retroativa.

Vendas com `status='cancelada'` ficam fora de todos os calculos e rankings.

## Contrato de resposta

```json
{
  "periodo": {
    "inicio": "2026-06-01T00:00:00+00:00",
    "fim": "2026-06-30T23:59:59+00:00"
  },
  "resumo": {
    "qtd_vendas": 12,
    "itens_vendidos": 20,
    "faturamento_bruto": 3500.0,
    "total_custo": 1800.0,
    "lucro_bruto": 1300.0,
    "margem_media": 37.14,
    "roi_medio": 72.22,
    "ticket_medio": 291.67
  },
  "evolucao": [
    {
      "periodo": "2026-06",
      "label": "Jun/26",
      "faturamento_bruto": 3500.0,
      "lucro_bruto": 1300.0
    }
  ],
  "produtos": [
    {
      "produto_id": "uuid",
      "nome": "Asad Lattafa",
      "quantidade": 5,
      "faturamento_bruto": 900.0,
      "lucro_bruto": 360.0,
      "margem": 40.0,
      "roi": 66.67
    }
  ],
  "canais": [
    {
      "canal_id": "uuid",
      "nome": "Shopee",
      "qtd_vendas": 6,
      "faturamento_bruto": 1800.0,
      "lucro_bruto": 620.0,
      "margem": 34.44,
      "roi": 52.54
    }
  ],
  "vendas": [
    {
      "id": "uuid",
      "numero": 32,
      "data_venda": "2026-06-20",
      "canal": "Shopee",
      "itens": 2,
      "faturamento_bruto": 240.0,
      "total_custo": 132.0,
      "lucro_bruto": 78.0,
      "margem": 32.5,
      "roi": 59.09
    }
  ]
}
```

Percentuais (`margem_media`, `roi_medio`, `margem`, `roi`) retornam em pontos percentuais, nao em fracao. Exemplo: `32.5` significa `32,5%`.

## Regras de calculo

Todos os calculos monetarios usam `Decimal`.

Resumo:

- `qtd_vendas`: quantidade de vendas concluidas no periodo.
- `itens_vendidos`: soma de `venda_itens.quantidade`.
- `faturamento_bruto`: soma de `vendas.total_bruto`.
- `total_custo`: soma de `vendas.total_custo`.
- `lucro_bruto`: soma de `vendas.lucro_bruto`.
- `margem_media`: `lucro_bruto / faturamento_bruto * 100`; zero quando faturamento for zero.
- `roi_medio`: `lucro_bruto / total_custo * 100`; `null` quando custo for zero.
- `ticket_medio`: `faturamento_bruto / qtd_vendas`; zero quando nao houver venda.

Produtos:

- Agrupar por `venda_itens.produto_id`.
- `quantidade`: soma de `quantidade`.
- `faturamento_bruto`: soma de `preco_unitario * quantidade`.
- `custo`: soma de `(custo_unitario + custo_embalagem) * quantidade`.
- `lucro_bruto`: soma de `venda_itens.lucro`.
- `margem`: `lucro_bruto / faturamento_bruto * 100`.
- `roi`: `lucro_bruto / custo * 100`; `null` quando custo for zero.
- Ordenar por `lucro_bruto` desc e limitar a 10 itens.

Canais:

- Agrupar por `vendas.canal_id`.
- `qtd_vendas`: quantidade de vendas concluidas.
- Totais usam os campos agregados de `vendas`.
- Ordenar por `lucro_bruto` desc.

Evolucao:

- Agrupar vendas concluidas por mes de `data_venda`.
- Para periodo de um unico mes, retorna ao menos o mes selecionado se nao houver vendas.
- Para trimestre, ano ou personalizado, retorna todos os meses entre `inicio` e `fim`, com zeros quando nao houver venda.

Tabela de vendas:

- Apenas vendas concluidas no periodo.
- Ordenar por `data_venda` desc e `numero` desc.
- `itens` vem da contagem de itens vinculados.

## Frontend

Arquivos previstos:

- `frontend/src/pages/estoque/Vendas.tsx`: transforma a tela em layout com abas e preserva a lista atual.
- `frontend/src/pages/estoque/vendas/VendasDashboard.tsx`: renderiza a aba Dashboard.
- `frontend/src/pages/estoque/vendas/VendasKpiCard.tsx`: card local para indicadores do dashboard, se a repeticao deixar a pagina pesada.

Fluxo frontend:

1. Usuario abre `/estoque/vendas`.
2. Aba inicial: `Lista`.
3. Ao clicar em `Dashboard`, o frontend carrega o periodo padrao do mes atual.
4. O frontend chama o endpoint com `Authorization: Bearer <session.access_token>`.
5. Exibe loading, erro ou dados.

UI da aba Dashboard:

- Header com seletor de periodo.
- 4 cards principais: faturamento bruto, lucro bruto, margem media, ROI medio.
- Linha auxiliar abaixo dos cards com ticket medio, quantidade de vendas e itens vendidos.
- Grafico de linhas com duas series: faturamento bruto e lucro bruto por mes.
- Ranking de produtos mais lucrativos.
- Ranking de canais mais lucrativos.
- Tabela de vendas do periodo.

## Erros e estados vazios

- Sem vendas no periodo: mostrar cards zerados, grafico com meses zerados e mensagem "Nenhuma venda concluida no periodo".
- Erro de API: exibir alerta com mensagem curta e manter seletor visivel.
- Sessao ausente: a rota ja e protegida; se nao houver token no momento da chamada, exibir erro "Sessao expirada".

## Testes

Backend:

- Service calcula resumo com decimal, margem, ROI e ticket medio.
- Ignora vendas canceladas.
- Agrupa produtos por lucro e quantidade.
- Agrupa canais por lucro e quantidade de vendas.
- Evolucao preenche meses sem venda com zero.
- Periodo invalido no router retorna 400.

Frontend:

- Aba `Dashboard` aparece dentro de `/estoque/vendas`.
- Ao abrir Dashboard, chama o endpoint com `inicio`, `fim` e Authorization.
- Renderiza cards, rankings e tabela com os dados da API.
- Estado vazio aparece quando nao ha vendas.
- Estado de erro aparece quando a API falha.

## Impacto em banco e deploy

Nao ha migracao de banco. O endpoint usa tabelas existentes.

Como o backend em producao roda na Vercel, a feature exige deploy do backend e do frontend apos merge/push. O frontend depende de `VITE_API_URL` ja configurado.

## Criterios de aceite

- `/estoque/vendas` continua permitindo criar, listar, detalhar e cancelar vendas.
- Aba Dashboard mostra dados calculados pelo backend.
- Vendas canceladas nao aparecem nos indicadores.
- Valores monetarios usam formato BRL no frontend.
- Percentuais aparecem como `%`.
- Testes backend e frontend passam.
- `npm run build` passa no frontend.
