# Dashboard de Estoque com Dados Reais — Design Spec

## Contexto

A página `/estoque` hoje é operacional: lista produtos com `estoque_atual > 0`, filtros, ordenação e ações de entrada/saída. O relatório de giro já cobre análise detalhada de giro/cobertura/parados, mas falta uma visão diária e resumida no topo da tela de Estoque para responder rapidamente: quanto há parado em estoque, quais produtos exigem atenção, se existem pedidos pendentes e onde há risco de ruptura.

O padrão recente do projeto para cálculos que cruzam várias tabelas é backend FastAPI com Supabase service role, como `GET /api/estoque/vendas/dashboard`, relatórios financeiros e sugestão de estoque mínimo. Este dashboard deve seguir esse padrão.

## Objetivo

Adicionar no topo da página `/estoque` um dashboard enxuto com dados reais de estoque, calculado pelo backend, mantendo a lista atual de produtos em estoque logo abaixo.

## Não Objetivos

- Não criar nova rota ou item de menu.
- Não substituir o relatório de giro de estoque.
- Não adicionar exportação PDF.
- Não criar previsão de compra perfeita ou automação de pedidos.
- Não criar migração de banco.
- Não alterar o fluxo de entrada, saída, pedidos, vendas ou decants.

## Experiência do Usuário

Ao abrir `/estoque`, o usuário verá primeiro uma faixa de indicadores e listas curtas, seguida pelos filtros e cards atuais.

A página deve continuar funcionando como tela operacional. O dashboard serve como resumo de decisão rápida, não como relatório completo.

### Conteúdo do topo

Cards principais:

1. **Valor em estoque**
   - Soma de `produtos.estoque_atual * produtos.custo_medio` para produtos com estoque positivo.
   - Produtos sem `custo_medio` contam como zero no valor, mas entram em uma contagem auxiliar de produtos sem custo.

2. **Produtos críticos**
   - Contagem de produtos com `estoque_atual > 0` e situação crítica/baixa pela regra já usada em `src/lib/estoque.ts`.
   - Critério esperado: crítico quando `estoque_atual <= ceil(estoque_minimo * 0.5)`; baixo quando `estoque_atual <= estoque_minimo`.

3. **Cobertura média**
   - Média em dias de cobertura dos produtos com vendas recentes suficientes.
   - Fórmula por produto: `estoque_atual / média diária vendida`.
   - Média diária usa vendas não canceladas dos últimos 90 dias, apenas itens `tipo='produto'`.
   - Produtos sem venda no período ficam fora da média.

4. **Produtos parados**
   - Contagem de produtos com `estoque_atual > 0` e nenhuma venda de produto nos últimos 90 dias.

5. **Pedidos pendentes**
   - Contagem de pedidos com status `aguardando`.
   - Separar também quantos estão atrasados quando `previsao_chegada < hoje`.

Blocos complementares:

1. **Reposição sugerida**
   - Lista dos até 5 produtos mais urgentes, ordenados por severidade: críticos primeiro, depois menor cobertura em dias, depois menor estoque atual.
   - Cada item mostra nome, estoque atual, estoque mínimo, cobertura estimada e situação.

2. **Estoque parado**
   - Lista dos até 5 produtos parados com maior valor parado.
   - Valor parado = `estoque_atual * custo_medio`.
   - Cada item mostra nome, quantidade, valor parado e dias sem venda quando houver última venda anterior ao período.

3. **Pedidos em aberto**
   - Lista dos até 5 pedidos aguardando mais antigos ou atrasados.
   - Cada item mostra número, fornecedor, previsão, valor total e status visual: `Atrasado` ou `Aguardando`.

## Arquitetura

### Backend

Criar uma função pura em `backend/app/services/estoque_dashboard.py` para calcular o payload do dashboard a partir de listas já consultadas do Supabase.

Criar endpoint:

```txt
GET /api/estoque/dashboard
```

O endpoint deve exigir usuário autenticado via `get_current_user`, consultar Supabase com service role e retornar JSON pronto para o frontend.

Tabelas consultadas:

- `produtos`: `id`, `nome`, `estoque_atual`, `estoque_minimo`, `custo_medio`, `categoria_id`, `marca_id`, `fornecedor_id`.
- `vendas`: `id`, `status`, `data_venda` dos últimos 90 dias, excluindo canceladas.
- `venda_itens`: `id`, `venda_id`, `produto_id`, `tipo`, `quantidade` para vendas do período.
- `pedidos`: `id`, `numero`, `fornecedor_id`, `previsao_chegada`, `valor_total`, `status`, `created_at` para status `aguardando`.
- `fornecedores`: `id`, `nome` para nomear pedidos pendentes.

O endpoint não deve consultar tabelas de decants para este MVP. Decants permanecem cobertos pelo relatório de giro e pela tela própria.

### Payload esperado

```json
{
  "periodo_dias": 90,
  "gerado_em": "2026-07-01T08:00:00-03:00",
  "resumo": {
    "valor_estoque": 1234.56,
    "produtos_em_estoque": 42,
    "produtos_sem_custo": 3,
    "produtos_baixo": 5,
    "produtos_criticos": 2,
    "produtos_parados": 8,
    "cobertura_media_dias": 37.5,
    "pedidos_pendentes": 4,
    "pedidos_atrasados": 1
  },
  "reposicao": [
    {
      "produto_id": "p1",
      "nome": "Lattafa Asad",
      "estoque_atual": 2,
      "estoque_minimo": 5,
      "situacao": "baixo",
      "unidades_vendidas_90d": 9,
      "media_diaria": 0.1,
      "cobertura_dias": 20.0
    }
  ],
  "parados": [
    {
      "produto_id": "p2",
      "nome": "Produto parado",
      "estoque_atual": 4,
      "valor_parado": 320.0,
      "ultima_venda": null,
      "dias_sem_venda": null
    }
  ],
  "pedidos": [
    {
      "pedido_id": "ped1",
      "numero": 123,
      "fornecedor": "Onun",
      "previsao_chegada": "2026-07-02",
      "valor_total": 900.0,
      "atrasado": false
    }
  ]
}
```

### Frontend

Modificar `frontend/src/pages/estoque/EstoqueView.tsx` para carregar o dashboard em paralelo aos dados atuais da lista de produtos.

Preferência de implementação:

- Criar componente dedicado `frontend/src/pages/estoque/EstoqueDashboard.tsx` se o JSX ficar grande.
- Usar o mesmo visual dos cards premium existentes (`glow-card`, `gold-hairline`, `StatCard` simples).
- Usar `formatBRL()` para valores monetários.
- Exibir estados de carregamento, erro e vazio sem bloquear a lista atual de produtos.

A falha do dashboard não deve impedir a lista operacional de estoque de carregar. Se o endpoint falhar, mostrar aviso discreto no bloco do dashboard e manter os cards de produtos funcionando.

## Regras de Cálculo

### Produtos considerados

- Para cards e listas do dashboard, considerar apenas produtos com `estoque_atual > 0`.
- Produtos com `estoque_atual <= 0` não contam como parado, crítico ou valor em estoque.

### Valor em estoque

```txt
valor_estoque = soma(estoque_atual * custo_medio)
```

Se `custo_medio` for nulo ou zero, o valor daquele produto é zero e o produto incrementa `produtos_sem_custo` quando `estoque_atual > 0`.

### Vendas recentes

- Janela padrão: últimos 90 dias, incluindo hoje, pela data local de São Paulo.
- Ignorar vendas com `status = cancelada`.
- Contar apenas `venda_itens.tipo = produto`.
- Quantidade vendida por produto é soma de `quantidade`.

### Cobertura

```txt
media_diaria = unidades_vendidas_90d / 90
cobertura_dias = estoque_atual / media_diaria
```

Se não houver venda no período, `cobertura_dias` fica `null`.

### Produtos parados

Produto parado é produto com estoque positivo e zero unidades vendidas nos últimos 90 dias.

Se houver venda anterior ao período, o backend pode preencher `ultima_venda` e `dias_sem_venda`. Para o MVP, se isso exigir consulta extra pesada, pode retornar `null`; a lista ainda usa valor parado para priorizar.

### Pedidos pendentes

- Pedido pendente: `status = aguardando`.
- Pedido atrasado: `previsao_chegada` não nula e menor que a data local atual.

## Tratamento de Erros

- Backend retorna `502` se a consulta ao Supabase falhar.
- Frontend mostra erro no bloco do dashboard, sem travar a lista de estoque.
- Ausência de dados retorna listas vazias e números zero/null, nunca erro.

## Testes

### Backend

Adicionar testes para a função pura em `backend/tests/test_estoque_dashboard.py` cobrindo:

- Valor em estoque com produtos sem custo.
- Classificação baixo/crítico/parado.
- Cobertura média ignorando produtos sem venda.
- Reposição ordenada por severidade.
- Pedidos pendentes e atrasados.

Adicionar testes de endpoint em `backend/tests/test_estoque_dashboard_router.py` cobrindo:

- Endpoint exige auth pelo padrão existente de testes.
- Consulta Supabase nas tabelas esperadas.
- Retorna payload do service.
- Erro de Supabase vira `502` limpo.

### Frontend

Adicionar/ajustar testes em `frontend/src/pages/estoque/__tests__/EstoqueView.test.tsx` cobrindo:

- Renderização dos cards do dashboard com payload real mockado.
- Renderização das listas curtas: reposição, parados e pedidos.
- Erro do dashboard não impede renderização dos cards de produtos.
- Loading do dashboard aparece sem bloquear filtros/lista.

## Documentação

Ao finalizar a implementação:

- Atualizar `docs/HANDOFF_IA.md` removendo o item de próximo passo e adicionando sessão do dashboard.
- Atualizar `docs/LOGS.md` com validações executadas.
- Não alterar `docs/BANCO.md`, pois não há migração.

## Decisões Aprovadas

- Dashboard aparece no topo de `/estoque`, acima da lista atual.
- Cálculo principal roda no backend FastAPI.
- Frontend mantém a lista operacional atual logo abaixo.
- Painel é misto e enxuto: risco, valor parado, giro/cobertura resumida e pedidos pendentes.
- Sem PDF e sem nova rota.