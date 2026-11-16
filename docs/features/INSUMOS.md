# 📦 Insumos

## Visão Geral

**Insumos** são os itens de consumo que acompanham cada produto vendido: frasco de decant, etiqueta, caixa, saco, fita, material de envio etc. Cada insumo tem estoque próprio, custo médio e estoque mínimo. A venda e o consumo de decant **baixam insumos automaticamente** a partir de **listas** configuráveis, e o custo deles entra no custo da venda.

Parte 1 do módulo Anúncios (spec: `docs/superpowers/specs/2026-11-16-anuncios-design.md`, seção 5; plano: `docs/superpowers/plans/2026-11-16-insumos.md`). As Partes 2 (Anúncios) e 3 (Vendas do ML) ainda precisam de plano próprio.

> Migrations `20261116100000_insumos_schema.sql` e `20261116110000_insumos_rpcs.sql` aplicadas no Supabase em 16/11/2026 (checks em `supabase/checks/` sem erro).

## Tela `/estoque/insumos` (`pages/estoque/Insumos.tsx`)

- Lista de insumos (nome, unidade, estoque, mínimo, custo médio), com destaque para os abaixo do mínimo (`abaixoDoMinimo`).
- **Compra** (`insumos/CompraInsumoModal.tsx`): quantidade, valor total, forma de pagamento e **saldo contado** opcional. Chama a RPC `registrar_compra_insumo`; a prévia usa `aplicarCompra` (`lib/insumos.ts`).
- **Acerto** de estoque: RPC `acertar_estoque_insumo` (diferença vira `perda` se negativa, `acerto` se positiva).
- **Listas** (`insumos/ListasInsumos.tsx`): quais insumos (e quantidades) cada tipo de item consome, mais peso e dimensões de embalagem.

## Listas (`insumo_listas` / `insumo_lista_itens`)

| Tipo | Quando é consumida |
|------|--------------------|
| `decant` (por `tamanho_ml`: 2,5 / 5 / 10) | Cada decant vendido ou consumido daquele tamanho |
| `frasco` | Cada frasco lacrado vendido |
| `envio_decant` | Venda em canal com envio que contém decant |
| `envio_frasco` | Venda em canal com envio que contém frasco |

Seeds: 3 listas de decant (2,5 / 5 / 10 ml) e uma de cada tipo restante, todas sem itens.

## Regras

- Estoque pode ficar **negativo** na baixa (a venda não é bloqueada). Na compra, saldo negativo conta como 0 no custo médio.
- Custo médio ponderado, 4 casas: `(max(saldo,0) × custo_medio + valor_total) / (max(saldo,0) + qtd)`.
- Compra gera despesa em `transacoes` com `origem='insumo'`, categoria `Insumos`.
- `canais.usa_envio` (false para "Loja física"): só canais com envio baixam as listas de envio. `vendas.custo_envio` guarda o custo dos insumos de envio.
- Estorno (cancelar/excluir venda, cancelar consumo de decant) devolve o saldo líquido de cada insumo; chamar de novo não estorna duas vezes (`_estornar_insumos`).

## Lógica pura (`lib/insumos.ts`, `lib/decantOrigens.ts`)

| Função | O que faz |
|--------|-----------|
| `aplicarCompra` | Diferença de contagem, novo estoque e custo médio (espelha a RPC) |
| `listaDoItem` / `listaEnvio` | Escolhe a lista de um item da venda / de envio |
| `somarItens` | Soma itens repetidos entre listas |
| `custoInsumos` | Custo de uma lista pelos custos médios |
| `abaixoDoMinimo` | Alerta de estoque mínimo |
| `planejarOrigens` | Divide os ml de um decant entre frasco aberto e lacrado a abrir |
| `totalOrigens`, `custoPrevistoOrigens`, `origemParaJson` | Soma, custo previsto e payload JSON das origens |
| `aplicarDevolucoes` | Reaplica ml devolvidos aos frascos ao planejar uma edição/correção |

## Tabelas

Detalhes em [[BANCO]]: `insumos`, `insumo_movimentacoes`, `insumo_listas`, `insumo_lista_itens`, `decant_origens`; colunas novas `canais.usa_envio` e `vendas.custo_envio`.

## RPCs

`acertar_estoque_insumo`, `registrar_compra_insumo` (schema), mais `_baixar_insumos`, `_estornar_insumos`, `_novo_decant`, `_consumir_origens`, `_devolver_origens`, `_decant_inalterado` e as reescritas `registrar_venda`, `cancelar_venda`, `excluir_venda`, `editar_venda`, `registrar_consumo_decant`, `corrigir_consumo_decant`, `cancelar_consumo_decant` (migration de RPCs).

## Limitações conhecidas

- Vender um decant de perfume que só tem frascos lacrados exige abrir o frasco antes em Decants (a Parte 3, spec 7.1, cobre isso).
- Na edição de venda, insumos da linha de produto e de envio são separados por heurística; falta uma coluna marcadora em `insumo_movimentacoes`.
- `venda_itens.lucro` não inclui `custo_envio` (só o `lucro_bruto` da venda).
- `embalagens_decant` continua no banco, mas as telas não a usam mais (substituída pelas listas de insumos).
- Excluir um frasco aberto que é a **primeira** origem de um decant ainda falha por FK em `decants`/`venda_itens` (pré-existente).

## Documentos Relacionados

- [[features/VENDAS]] — Insumos e custo de envio na venda
- [[features/DECANTS]] — Origens múltiplas e insumos no consumo
- [[BANCO]] — Schema e RPCs
