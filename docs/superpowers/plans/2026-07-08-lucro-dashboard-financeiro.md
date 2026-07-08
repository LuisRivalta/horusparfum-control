# Lucro Real no Dashboard Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o card Lucro para descontar o custo das vendas concluidas no periodo sem alterar o saldo de caixa.

**Architecture:** A biblioteca financeira recebe snapshots resumidos de vendas e calcula o custo vendido no periodo. O componente consulta `transacoes` e `vendas` em paralelo e entrega ambos para a funcao pura.

**Tech Stack:** React 19, TypeScript, Supabase JS, decimal.js, Vitest, Testing Library.

## Global Constraints

- Nao criar transacao de saida para custo de mercadoria.
- Ignorar vendas canceladas.
- Usar `data_venda` para filtrar custos pelo periodo.
- Taxa e frete nao podem ser descontados duas vezes.
- Nao criar migracao nem alterar a RPC `registrar_venda`.

---

### Task 1: Calculo puro de lucro com custo vendido

**Files:**
- Modify: `frontend/src/lib/financeiro.ts`
- Test: `frontend/src/lib/__tests__/financeiro.test.ts`

**Interfaces:**
- Consumes: `Transacao[]`, `Periodo` e `VendaFinanceira[]`.
- Produces: `resumoPeriodo(transacoes, periodo, vendas?)`, mantendo compatibilidade com chamadas existentes.

- [ ] **Step 1: Escrever testes que reproduzem o erro**

Adicionar o tipo `VendaFinanceira` aos imports e testar:

```ts
it('desconta o custo de vendas concluidas no periodo', () => {
  const transacoes = [tx({ tipo: 'entrada', valor: 509.70 })]
  const vendas = [
    { data_venda: '2026-06-10', status: 'concluida', total_custo: 304.97 },
  ]
  expect(resumoPeriodo(transacoes, periodo, vendas)).toEqual({
    receita: 509.70,
    despesa: 0,
    lucro: 204.73,
  })
})

it('ignora custo de venda cancelada ou fora do periodo', () => {
  const transacoes = [tx({ tipo: 'entrada', valor: 500 })]
  const vendas = [
    { data_venda: '2026-06-10', status: 'cancelada', total_custo: 200 },
    { data_venda: '2026-05-31', status: 'concluida', total_custo: 100 },
  ]
  expect(resumoPeriodo(transacoes, periodo, vendas).lucro).toBe(500)
})
```

- [ ] **Step 2: Rodar os testes e confirmar RED**

Run: `cmd /c npm run test:run -- src/lib/__tests__/financeiro.test.ts`

Expected: FAIL porque `resumoPeriodo` ainda ignora o terceiro argumento.

- [ ] **Step 3: Implementar o calculo minimo**

Em `financeiro.ts`, adicionar:

```ts
export interface VendaFinanceira {
  data_venda: string
  status: 'concluida' | 'cancelada'
  total_custo: number
}
```

Atualizar `resumoPeriodo` para aceitar `vendas: VendaFinanceira[] = []`, filtrar
vendas concluidas cuja data local esteja no periodo, somar `total_custo` com
`Decimal` e calcular `receita - despesa - custoVendas`.

- [ ] **Step 4: Rodar os testes e confirmar GREEN**

Run: `cmd /c npm run test:run -- src/lib/__tests__/financeiro.test.ts`

Expected: todos os testes de `financeiro.test.ts` passam.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/financeiro.ts frontend/src/lib/__tests__/financeiro.test.ts
git commit -m "fix: desconta custo vendido do lucro financeiro"
```

### Task 2: Integrar vendas no Dashboard Financeiro

**Files:**
- Modify: `frontend/src/pages/financeiro/Dashboard.tsx`
- Test: `frontend/src/pages/financeiro/__tests__/Dashboard.test.tsx`

**Interfaces:**
- Consumes: consulta Supabase `vendas.select('data_venda,status,total_custo')`.
- Produces: card Lucro usando `resumoPeriodo(transacoes, periodo, vendas)`.

- [ ] **Step 1: Escrever teste de integracao que reproduz o erro**

Fazer o mock de `supabase.from` retornar transacoes para `transacoes` e:

```ts
const mockVendas = [
  { data_venda: '2026-06-10', status: 'concluida', total_custo: 120 },
  { data_venda: '2026-06-11', status: 'cancelada', total_custo: 999 },
]
```

Atualizar a expectativa do teste mensal para `R$ 180,00`, pois
`500 - 200 - 120 = 180`, e verificar que `from` recebeu `vendas`.

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `cmd /c npm run test:run -- src/pages/financeiro/__tests__/Dashboard.test.tsx`

Expected: FAIL mostrando lucro antigo de `R$ 300,00` e ausência da consulta `vendas`.

- [ ] **Step 3: Implementar a consulta e estado**

Adicionar estado `vendas: VendaFinanceira[]`. No `useEffect`, executar
`Promise.all` para:

```ts
supabase.from('transacoes').select('*')
supabase.from('vendas').select('data_venda,status,total_custo')
```

Armazenar ambos os resultados, reportar erro de qualquer consulta e encerrar
`loading` após as duas respostas. Chamar:

```ts
const resumo = resumoPeriodo(transacoes, periodo, vendas)
```

- [ ] **Step 4: Rodar teste focado e suite completa**

Run: `cmd /c npm run test:run -- src/pages/financeiro/__tests__/Dashboard.test.tsx`

Expected: teste focado passa.

Run: `cmd /c npm run test:run`

Expected: suite frontend completa passa.

- [ ] **Step 5: Validar build**

Run: `cmd /c npm run build`

Expected: TypeScript e Vite terminam com exit code 0.

- [ ] **Step 6: Atualizar documentacao e commit**

Atualizar `docs/HANDOFF_IA.md` e `docs/LOGS.md` com a regra corrigida e os
resultados de verificacao.

```bash
git add frontend/src/pages/financeiro/Dashboard.tsx frontend/src/pages/financeiro/__tests__/Dashboard.test.tsx docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "fix: corrige lucro do dashboard financeiro"
```
