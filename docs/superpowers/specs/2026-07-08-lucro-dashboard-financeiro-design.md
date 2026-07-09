# Correcao do lucro no Dashboard Financeiro

## Problema

O Dashboard Financeiro calcula hoje `lucro = entradas - saidas`. Uma venda gera uma
entrada pelo valor bruto e saidas apenas para taxa e frete. O custo dos itens fica
armazenado em `vendas.total_custo`, mas nao participa do resumo financeiro. Quando
nao existem outras saidas, receita e lucro aparecem com o mesmo valor.

## Decisao

Manter o fluxo de caixa separado do resultado comercial:

- `Saldo historico`: entradas menos saidas da tabela `transacoes`.
- `Receita`: entradas da tabela `transacoes` no periodo.
- `Despesas`: saidas da tabela `transacoes` no periodo.
- `Lucro`: receita menos despesas menos o custo das vendas concluidas no periodo.

O custo de mercadoria vendida nao sera inserido como uma transacao de saida, pois
isso alteraria o saldo de caixa sem existir pagamento no momento da venda.

## Dados e fluxo

O Dashboard Financeiro continuara consultando `transacoes`, incluindo `id` e
`venda_id`, e tambem consultara `vendas`, selecionando `id`, `data_venda`, `status`
e `total_custo`. `transacoes.venda_id` referencia `vendas.id` e permite resolver a
data contabil usada pelo painel.

Para resumo, agrupamento por categoria e evolucao mensal, a data efetiva de cada
transacao sera:

1. `vendas.data_venda`, quando `transacoes.venda_id` encontrar a venda correspondente;
2. `transacoes.created_at`, para transacoes manuais ou quando a venda nao estiver disponivel.

As funcoes puras receberao `vendas` como ultimo parametro opcional, com lista vazia
por padrao, preservando todas as chamadas existentes que usam apenas `created_at`.

A funcao pura de resumo recebera as vendas e:

1. filtrara pelo periodo selecionado usando `data_venda`;
2. ignorara vendas com `status = 'cancelada'`;
3. somara `total_custo`;
4. calculara `lucro = receita - despesa - custo_das_vendas`.

Taxa e frete ja sao saidas em `transacoes`, portanto nao serao descontados novamente.
Vendas antigas sem custo registrado contribuem com custo zero.

## Paginacao de vendas

As vendas serao carregadas em lotes de 1.000. Cada consulta aplicara primeiro
`order('id', { ascending: true })` e depois `range(inicio, fim)`, com faixas
inclusivas `0-999`, `1000-1999` e assim por diante. A ordenacao total por `id`
mantem as fronteiras estaveis entre paginas e evita omissoes ou duplicacoes.

## Interface

O card continua chamado `Lucro`. Nenhum novo card ou controle sera adicionado.
Saldo, receita, despesas, graficos e agrupamento por categoria mantem a mesma
apresentacao; os valores passam a compartilhar a mesma regra de data efetiva.

## Testes

- Teste unitario prova que o resumo desconta custo de venda concluida.
- Teste unitario prova que venda cancelada nao afeta o lucro.
- Testes unitarios provam que categoria e evolucao mensal usam `data_venda` em uma
  venda retroativa.
- Teste da pagina prova que o Dashboard consulta vendas e exibe o lucro corrigido.
- Teste da pagina prova que os graficos recebem vendas e que a paginacao ordena por
  `id` antes de consultar as faixas inclusivas.
- Suite completa e build validam ausencia de regressao.

## Fora de escopo

- Alterar lancamentos historicos em `transacoes`.
- Criar migracao ou modificar a RPC `registrar_venda`.
- Reestruturar o relatorio financeiro, que pode receber a mesma regra em uma
  evolucao separada.
