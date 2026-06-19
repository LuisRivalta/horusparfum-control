# Relatório de giro de estoque — Design

> Data: 2026-06-19
> Tipo: frontend-only (sem migração de banco)

## Objetivo

Tornar funcional o stub `/estoque/relatorios` ("Relatório de giro"), entregando um
painel completo de giro de estoque: velocidade de giro, cobertura em dias e
sinalização de produtos parados (estoque encalhado), com período selecionável pelo
usuário. Cobre frascos cheios no painel principal e decants (consumo de ml dos
frascos abertos) numa seção separada.

## Decisões (do brainstorming)

1. **Painel completo:** giro (razão), cobertura em dias e produtos parados juntos.
2. **Escopo:** frascos cheios no painel principal + seção separada de decants
   (eixo ml). Não somar decants ao giro de unidades.
3. **Base do giro = estoque médio do período** (não estoque atual), reconstruído
   ancorando no `estoque_atual` e descendo pelo ledger `movimentacoes`.
4. **"Parado"** = `estoque_atual` > 0 **e** zero saída no período selecionado.
5. **Período = últimos N dias**, escolhido via presets (30/60/90/180) + campo
   personalizado. Default **90 dias**. O N escolhido define o limite de "parado".
6. **Arquitetura frontend-only** (Abordagem A): busca `produtos` + `movimentacoes`
   no cliente e calcula em lib pura testável, espelhando o padrão do Dashboard
   financeiro. Sem RPC/migração.

## Métricas — frascos cheios

Período = últimos **N dias**, portanto fim do período = hoje, logo
`estoque_fim = estoque_atual`. Para cada produto, dado `estoque_atual` e as
movimentações do produto com `created_at >= início` (início = hoje − N dias):

- `saidas` = Σ `quantidade` das movimentações `tipo = 'saida'` no período
- `entradas` = Σ `quantidade` das movimentações `tipo = 'entrada'` no período
- `estoque_inicio` = `estoque_atual` − `entradas` + `saidas`
- `estoque_medio` = (`estoque_inicio` + `estoque_atual`) / 2
- **Giro** = `saidas` ÷ `estoque_medio`; se `estoque_medio <= 0`, giro = `null`
  (exibido como "—")
- **Cobertura (dias)** = `estoque_atual` × N ÷ `saidas`; se `saidas = 0`,
  cobertura = `null`/∞ (produto parado)
- **Parado** = `estoque_atual` > 0 **e** `saidas = 0`

> **Por que ancorar no `estoque_atual`:** o `estoque_atual` é sempre correto (fonte
> da verdade do estoque hoje). Reconstruir o saldo passado a partir do ledger
> "descendo" do atual evita depender de um baseline histórico completo no ledger
> (produtos podem ter sido semeados com estoque inicial sem uma `movimentacao`
> correspondente). Como todas as mudanças recentes de estoque passam por RPCs que
> gravam em `movimentacoes` (confirmar_recebimento, registrar_entrada,
> registrar_saida, registrar_venda/cancelar_venda), a reconstrução do período
> recente é precisa.

## Métricas — decants (seção separada)

Eixo ml, por **frasco aberto** (`frascos_abertos` com `status` ativo/esgotado) e
seus consumos (`decants` com `created_at >= início`):

- `ml_consumido` = Σ `decants.ml` no período (do frasco)
- `ml_restante` = `frascos_abertos.ml_restante` (estado atual)
- **Cobertura (dias)** = `ml_restante` × N ÷ `ml_consumido`; se `ml_consumido = 0`,
  cobertura = `null`/∞
- **Parado** = `ml_restante` > 0 **e** `ml_consumido = 0` no período

Seção mais leve que a principal (sem card de valor encalhado para decants na v1).

## Componentes / arquitetura

### `lib/giro.ts` (lógica pura, TDD)

Sem dependência de React/Supabase. Tipos e funções:

- `type MovimentacaoGiro = { tipo: 'entrada' | 'saida'; quantidade: number }`
- `calcularGiroProduto(estoqueAtual: number, movs: MovimentacaoGiro[], dias: number)`
  → `{ saidas, entradas, estoqueInicio, estoqueMedio, giro: number | null,
  coberturaDias: number | null, parado: boolean }`
- `calcularGiroDecant(mlRestante: number, mlConsumido: number, dias: number)`
  → `{ coberturaDias: number | null, parado: boolean }`
- `resumoGiro(linhas)` → `{ giroMedio, qtdParados, valorEncalhado, coberturaMedia }`
  (valorEncalhado = Σ `estoqueAtual × custoMedio` dos parados; giroMedio/coberturaMedia
  consideram só linhas com valor definido)
- `ordenarGiro(linhas, criterio)` — critérios: `giro_desc`, `giro_asc`,
  `cobertura_asc`, `cobertura_desc`, `saidas_desc`, `az`

Números inteiros/razões com `number` puro (não monetário); `valorEncalhado` é
monetário e usa `decimal.js` como o resto do projeto.

### Página `pages/estoque/Relatorios.tsx` (`EstRelatorios`)

Substitui o stub atual mantendo o header ("Estoque / Relatório de giro").
Responsabilidades:

- **Estado de período:** `dias` (default 90) com presets + input personalizado.
- **Fetch** (em `useEffect`/callback, refaz ao mudar `dias`):
  - `produtos`: `id, nome, estoque_atual, custo_medio` (todos)
  - `movimentacoes`: `produto_id, tipo, quantidade, created_at` com
    `created_at >= início`
  - `frascos_abertos`: `id, produto_id, ml_restante, status` + join nome do produto
  - `decants`: `frasco_id, ml, created_at` com `created_at >= início`
- Agrupa movimentações/decants por produto/frasco, chama `lib/giro.ts`, monta as
  linhas e o resumo.
- **Render:**
  - Controle de período (presets 30/60/90/180 + "N dias" personalizado)
  - Cards de resumo: Giro médio · Produtos parados (qtd) · Valor encalhado (R$) ·
    Cobertura média
  - Tabela principal (frascos): produto · estoque atual · saídas · giro (x) ·
    cobertura (dias) · badge Parado. Cabeçalhos ordenáveis + toggle "só parados".
  - Seção Decants: tabela por frasco — produto · ml restante · ml consumidos ·
    cobertura (dias) · badge Parado.
- Estados de loading e vazio (sem produtos / sem movimentações no período).

Componente de controle de período pode ser inline na página (pequeno) — não exige
componente compartilhado novo.

## Padrões e convenções

- `formatBRL()` para o valor encalhado; cores via CSS variables (badge parado usa
  `warn`/`down`).
- Alias `@/`, PascalCase nos componentes, snake_case nas colunas.
- Espelha o padrão do Dashboard financeiro (agregação client-side + lib pura).

## Testes

- **`lib/__tests__/giro.test.ts`** (TDD): `calcularGiroProduto` (caso normal,
  saídas=0 → parado/cobertura null, estoque_medio=0 → giro null, período sem
  movimentações), `calcularGiroDecant`, `resumoGiro` (valor encalhado, médias
  ignorando nulls), `ordenarGiro`.
- **`pages/estoque/__tests__/Relatorios.test.tsx`**: renderiza a tabela com dados
  mockados do Supabase; troca de período dispara novo fetch/recalculo; badge
  "Parado" aparece para produto com estoque e zero saída; seção de decants
  renderiza.

## Fora de escopo (v1)

- Gráficos (recharts) — tabelas + cards bastam; ranking visual pode vir depois.
- Migração de agregação para SQL/RPC — só se `movimentacoes` crescer a ponto de
  esbarrar no limite de 1.000 linhas do Supabase (documentar como limitação
  conhecida, igual ao Dashboard).
- Curva ABC / classificação de giro além de "parado".
- Estoque médio "verdadeiro" por integral diária — a aproximação
  (início+fim)/2 é suficiente.

## Limitações conhecidas

- A query de `movimentacoes` não pagina; se o histórico de N dias passar de 1.000
  linhas, pode truncar (mesma limitação já registrada para o Dashboard financeiro).
  Aceitável no volume atual; migrar para agregação SQL quando necessário.
