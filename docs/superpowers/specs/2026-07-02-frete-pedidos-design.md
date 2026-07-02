# Frete em Pedidos de Compra

## Objetivo

Adicionar frete manual ao fluxo de criacao e edicao de pedidos de compra, mantendo o frete separado dos itens e somado ao total do pedido.

## Escopo

- Criar coluna frete em pedidos, com valor monetario nao negativo e default zero.
- Exibir campo Frete (R$) no modal Novo pedido e no modo de edicao.
- Somar subtotal dos itens + frete no total exibido e salvo em valor_total.
- Persistir o frete separado no cadastro do pedido.
- Manter a importacao por PDF preenchendo apenas itens; frete continua manual.

## Fora de escopo

- Ratear frete por item para custo medio neste ciclo.
- Alterar a RPC confirmar_recebimento ou o calculo de custo medio dos produtos.
- Criar lancamento financeiro automatico do frete de compra.

## UX

O campo de frete fica proximo ao resumo do pedido, depois dos itens. Valor vazio equivale a zero. O total final mostra a soma dos itens com o frete.

## Dados

A migration adiciona pedidos.frete numeric(12,2) not null default 0 check (frete >= 0). Registros antigos passam a ter frete zero.

## Validacao

- Teste de calcularTotalPedido cobre frete opcional.
- Teste do modal cobre campo de frete, total exibido e payload salvo.
- Teste estatico cobre a migration de pedidos.frete.
- Suite frontend, backend e build devem passar antes de finalizar.
