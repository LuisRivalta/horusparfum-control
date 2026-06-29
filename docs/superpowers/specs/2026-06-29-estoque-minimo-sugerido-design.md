# Estoque mínimo sugerido por vendas

Data: 2026-06-29

## Contexto

O cadastro de produto mantém `estoque_minimo` como uma configuração do catálogo, usada para classificar estoque como OK, baixo ou crítico. O usuário não tem uma referência confiável para preencher esse número manualmente no início da operação.

Como o sistema já registra vendas reais com baixa de estoque, o mínimo pode ser sugerido por analytics sem transformar cadastro em movimentação de estoque.

## Objetivo

Calcular uma sugestão de `estoque_minimo` para cada produto com base nas vendas reais, permitindo que o usuário aceite a sugestão quando fizer sentido.

## Escopo

- Criar cálculo backend para sugestão de estoque mínimo por produto.
- Usar vendas reais concluídas como base.
- Ignorar vendas canceladas.
- Exibir a sugestão no modal de detalhes/edição do produto.
- Permitir aplicar a sugestão no campo `Estoque mínimo`.
- Manter o campo manual editável.

## Fora de escopo

- Alterar automaticamente `estoque_minimo` sem ação do usuário.
- Criar tela dedicada de alertas.
- Usar saídas manuais, perdas, brindes ou consumo de decants na primeira versão.
- Criar nova tabela de histórico ou configurações globais.
- OCR, LLM ou previsões avançadas.

## Regra de cálculo

Parâmetros iniciais fixos:

- Período analisado: últimos 90 dias.
- Dias de reposição: 15 dias.
- Margem de segurança: 30%.

Fórmula:

```txt
media_diaria = unidades_vendidas_no_periodo / 90
estoque_minimo_sugerido = ceil(media_diaria * 15 * 1.3)
```

Se o produto vendeu pelo menos uma unidade no período e a fórmula resultar em zero, a sugestão mínima será 1.

Se não houver vendas no período, o backend retornará ausência de sugestão em vez de sugerir zero.

## API

Novo endpoint protegido no backend:

```txt
GET /api/estoque/produtos/{produto_id}/estoque-minimo-sugerido
```

Resposta com dados suficientes para explicar o cálculo:

```json
{
  "produto_id": "uuid",
  "periodo_dias": 90,
  "unidades_vendidas": 12,
  "media_diaria": 0.13,
  "dias_reposicao": 15,
  "margem_seguranca": 0.3,
  "estoque_minimo_sugerido": 3,
  "tem_dados": true
}
```

Quando não houver vendas:

```json
{
  "produto_id": "uuid",
  "periodo_dias": 90,
  "unidades_vendidas": 0,
  "media_diaria": 0,
  "dias_reposicao": 15,
  "margem_seguranca": 0.3,
  "estoque_minimo_sugerido": null,
  "tem_dados": false
}
```

## Backend

O cálculo fica no FastAPI, não no frontend, porque depende de agregação de histórico de vendas.

Fonte de dados:

- `vendas`: filtra por data e status.
- `venda_itens`: soma quantidade de itens vendidos do produto.

Regras:

- Considerar apenas vendas dentro dos últimos 90 dias.
- Ignorar `vendas.status = 'cancelada'`.
- Considerar apenas `venda_itens.produto_id = produto_id`.
- Usar aritmética decimal quando houver divisão.

## Frontend

No modal de detalhes do produto:

- Mostrar bloco discreto de sugestão perto de `Estoque mínimo`.
- Enquanto carrega: mostrar estado de carregamento compacto.
- Com dados: mostrar `Sugestão por vendas: X`.
- Sem dados: mostrar `Ainda sem vendas suficientes para sugerir`.
- Em erro: mostrar mensagem curta e manter edição manual funcionando.

No modo de edição:

- Botão `Usar sugestão` preenche o campo `Estoque mínimo`.
- Salvar continua usando o fluxo atual de update do produto.
- A sugestão não altera o banco sozinha.

## Testes

Backend:

- Calcula sugestão arredondando para cima.
- Retorna mínimo 1 quando houve venda, mas a fórmula fica abaixo de 1.
- Retorna `tem_dados=false` quando não há vendas.
- Ignora vendas canceladas.
- Endpoint consulta Supabase com autenticação e retorna payload esperado.

Frontend:

- Modal exibe sugestão quando a API retorna dados.
- Botão `Usar sugestão` preenche `Estoque mínimo`.
- Modal exibe estado sem dados quando `tem_dados=false`.
- Erro de API não bloqueia edição manual.

## Critérios de aceite

- Usuário consegue continuar preenchendo `Estoque mínimo` manualmente.
- Produto sem vendas não recebe sugestão artificial.
- Produto com vendas recebe sugestão explicável.
- Clicar em `Usar sugestão` só preenche o formulário; alteração só persiste ao salvar.
- Testes backend e frontend passam.
- Documentação viva é atualizada ao fim da implementação.
