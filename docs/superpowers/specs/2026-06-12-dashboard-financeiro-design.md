# Design — Dashboard Financeiro com Dados Reais

> Data: 2026-06-12 · Status: aprovado pelo usuário

## Resumo

A página `FinDashboard` (hoje 100% placeholder — quatro cards mostrando "—" e uma caixa
vazia) passa a exibir dados reais da tabela `transacoes` do Supabase: saldo histórico,
receita/despesa/lucro do período selecionado, e dois gráficos (evolução dos últimos 6 meses
e quebra por categoria). Um seletor de período no topo controla os cards e o gráfico de
categorias, abrindo por padrão no mês corrente.

## Escopo

**Dentro do escopo:**
- Seletor de período: Mês · Trimestre · Ano · Personalizado (intervalo de datas)
- 4 cards: Saldo histórico, Receita, Despesas, Lucro
- Gráfico de evolução (últimos 6 meses, fixo) — receita vs. despesa
- Gráfico de categorias (do período selecionado)
- Lógica pura testável em `lib/financeiro.ts` (TDD)

**Fora do escopo (deferido):**
- Widgets de `contas` (vencimentos) e `metas` (progresso) — já têm página própria
- Agregação no SQL (hoje calcula em memória; ver "Evolução futura")
- Exportação/PDF do dashboard

## Fonte de dados

Tabela `transacoes`: `{ id, descricao, tipo: 'entrada' | 'saida', valor: numeric(12,2),
categoria: text, created_at: timestamptz }`.

O dashboard busca **todas** as transações uma vez (`select('*')`) e calcula tudo em memória.
Justificativa: loja interna com poucos usuários e baixo volume; o seletor de período fica
instantâneo (sem refetch) e o saldo histórico sai de graça. Se o volume crescer muito,
migrar para agregações SQL (evolução futura, sem mudança de contrato no frontend).

Somas monetárias usam `decimal.js` (mesmo padrão de `lib/pedidos.ts`) para evitar drift de
ponto flutuante e casar com `ROUND(numeric, 2)` do Postgres.

## Lógica pura — `lib/financeiro.ts`

### Tipos

```typescript
export interface Transacao {
  id: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  categoria: string | null
  created_at: string
}

export interface Periodo {
  inicio: Date   // 00:00:00.000 do primeiro dia
  fim: Date      // 23:59:59.999 do último dia
  label: string  // ex: "Junho 2026", "2º trimestre 2026", "2026", "01/06 – 15/06"
}

export interface ResumoPeriodo {
  receita: number
  despesa: number
  lucro: number
}

export interface FatiaCategoria {
  categoria: string
  total: number
}

export interface PontoEvolucao {
  mes: string      // ex: "jan", "fev" (rótulo curto do eixo X)
  receita: number
  despesa: number
}
```

### Funções de cálculo

- `calcularSaldoHistorico(transacoes: Transacao[]): number`
  Soma de todas as entradas menos todas as saídas (ignora período).

- `resumoPeriodo(transacoes: Transacao[], periodo: Periodo): ResumoPeriodo`
  Filtra por `created_at` dentro de `[inicio, fim]` (inclusivo nas duas pontas), soma
  receita (entradas) e despesa (saídas); `lucro = receita - despesa`.

- `agruparPorCategoria(transacoes: Transacao[], periodo: Periodo, tipo: 'entrada' | 'saida'): FatiaCategoria[]`
  Filtra por período + tipo, agrupa por `categoria` (null vira "Sem categoria"), soma,
  ordena por total decrescente.

- `evolucaoMensal(transacoes: Transacao[], referencia: Date, nMeses = 6): PontoEvolucao[]`
  Retorna os últimos `nMeses` meses terminando no mês de `referencia`, cada um com receita
  e despesa somadas; meses sem transação aparecem com 0 (série contínua).

### Construtores de período

- `periodoMes(ano: number, mes: number): Periodo` — `mes` 0-11
- `periodoTrimestre(ano: number, trimestre: number): Periodo` — `trimestre` 1-4
- `periodoAno(ano: number): Periodo`
- `periodoPersonalizado(inicio: Date, fim: Date): Periodo` — normaliza início para 00:00 e
  fim para 23:59:59.999

Todos produzem `label` legível em pt-BR.

## Componentes

### `Dashboard.tsx` (orquestrador)
- Busca `transacoes` no mount (`useState`/`useEffect` + supabase, padrão do projeto); estados
  de `loading` e `erro`
- Estado `periodo`, inicializado com `periodoMes(anoAtual, mesAtual)` do mês corrente
- Renderiza: header, `PeriodSelector`, os 4 cards, e os dois gráficos
- Cards reusam o padrão visual atual (glow-card, hover, ícone)

### `PeriodSelector.tsx`
- Props: `{ value: Periodo; onChange: (p: Periodo) => void }`
- Botões de granularidade: Mês · Trimestre · Ano · Personalizado
- Conforme a granularidade, mostra o picker adequado (mês+ano / trimestre+ano / ano / duas
  datas) e emite o `Periodo` via construtor correspondente

### `EvolucaoChart.tsx`
- Props: `{ data: PontoEvolucao[] }`
- recharts `BarChart` com barras de receita (dourado) e despesa (vermelho/down)
- Cores via CSS variables do tema (`fill="var(--color-gold)"` etc.) para funcionar em
  dark/light

### `CategoriaChart.tsx`
- Props: `{ data: FatiaCategoria[] }`
- recharts `BarChart` horizontal (rótulos de categoria legíveis), barras douradas
- Vazio → mensagem "Sem dados no período"

## Tratamento de erros e bordas

- Erro na busca → mensagem discreta no lugar dos gráficos; cards mostram "—"
- Período sem transações → cards em R$ 0,00; gráfico de categoria com estado vazio
- `categoria` nula → agrupada como "Sem categoria"

## Testes

**Unitários — `lib/__tests__/financeiro.test.ts`:**
- `calcularSaldoHistorico`: entradas − saídas; lista vazia = 0
- `resumoPeriodo`: inclusão nas bordas (transação no primeiro e no último instante do período
  conta); transação fora do período não conta
- `agruparPorCategoria`: agrupa e ordena desc; categoria nula vira "Sem categoria"
- `evolucaoMensal`: retorna 6 pontos; meses sem dados vêm com 0
- Construtores: `periodoMes`/`periodoTrimestre`/`periodoAno`/`periodoPersonalizado` produzem
  início e fim corretos (incluindo fim 23:59:59.999)

**Componente — `pages/financeiro/__tests__/Dashboard.test.tsx`:**
- Supabase mockado com transações de exemplo → cards mostram valores calculados
- Trocar o período no seletor atualiza os cards
- `ResponsiveContainer` do recharts precisa de largura em jsdom: mockar
  `ResponsiveContainer` (ou os componentes de chart) para focar o teste nos cards e no
  seletor; não testar a renderização interna do SVG

## Evolução futura

- **Agregação no SQL:** se o volume crescer, substituir o `select('*')` + cálculo em memória
  por uma view/RPC que retorna os agregados já prontos. O contrato dos componentes (que
  recebem `ResumoPeriodo`, `FatiaCategoria[]`, `PontoEvolucao[]`) não muda.
- **Widgets de contas e metas:** próximos vencimentos e progresso de metas como cards
  adicionais.
