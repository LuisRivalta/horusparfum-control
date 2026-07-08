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

O Dashboard Financeiro continuara consultando `transacoes` e tambem consultara
`vendas`, selecionando `data_venda`, `status` e `total_custo`.

A funcao pura de resumo recebera as vendas e:

1. filtrara pelo periodo selecionado usando `data_venda`;
2. ignorara vendas com `status = 'cancelada'`;
3. somara `total_custo`;
4. calculara `lucro = receita - despesa - custo_das_vendas`.

Taxa e frete ja sao saidas em `transacoes`, portanto nao serao descontados novamente.
Vendas antigas sem custo registrado contribuem com custo zero.

## Interface

O card continua chamado `Lucro`. Nenhum novo card ou controle sera adicionado.
Saldo, receita, despesas, graficos e agrupamento por categoria permanecem
inalterados.

## Testes

- Teste unitario prova que o resumo desconta custo de venda concluida.
- Teste unitario prova que venda cancelada nao afeta o lucro.
- Teste da pagina prova que o Dashboard consulta vendas e exibe o lucro corrigido.
- Suite completa e build validam ausencia de regressao.

## Fora de escopo

- Alterar lancamentos historicos em `transacoes`.
- Criar migracao ou modificar a RPC `registrar_venda`.
- Reestruturar o relatorio financeiro, que pode receber a mesma regra em uma
  evolucao separada.
