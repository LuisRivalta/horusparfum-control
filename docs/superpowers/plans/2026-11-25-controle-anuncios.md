# Controle de anúncios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/anuncios/controle` com grade perfume × variante por plataforma (ML/Shopify), marcação manual e estado automático.

**Architecture:** Tabela nova `anuncio_marcas` (só marcas manuais). Lógica pura em `lib/controleAnuncios.ts` junta marcas manuais, anúncios publicados do ML e `canal_vinculos`, e calcula célula/estado. A página lê tudo pelo cliente Supabase; sem backend novo.

**Tech Stack:** React + TS + Tailwind, Supabase JS, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-controle-anuncios-design.md`

## Global Constraints

- Plataformas: só `'ml'` e `'shopify'`.
- Tamanhos de decant: `anuncios_config.tamanhos_decant` (default `{2.5,5,10}`); decants só se `tipos_produto.vende_decant`.
- Migration é aplicada pelo Luis no SQL Editor; **não** usar o MCP do Supabase (aponta para outro projeto).
- Textos da UI em português; cores por variáveis CSS do tema (dark e light); ícones do `Icon` existente (`check`, `x`).
- Commits sem `Co-Authored-By` (preferência do Luis), direto na `main`, sem push.
- Testes: `cd frontend && npx vitest run <arquivo>`; suíte toda `npx vitest run`; build `npm run build`.

## Review Focus

- `ml` vindo do Supabase como string (`"2.5"`) ou número — comparar por `Number()`; testado na Task 2.
- Célula verde manual **e** automática ao mesmo tempo — fica automática (não desmarcável); testado na Task 2.
- Perfume sem estoque nenhum e nada criado (tudo cinza) — estado `aguardando`, não `sem_anuncio`; testado na Task 2.
- Clique duplo em marcar (insert repetido → erro `23505`) — tratar como sucesso, sem mensagem de erro; testado na Task 3.
- Busca com acento/maiúscula ("Asád", "asad") — normalizar NFD + lowercase; testado na Task 2.

---

### Task 1: Tabela `anuncio_marcas`

**Files:**
- Create: `supabase/migrations/20261125100000_anuncio_marcas.sql`
- Create: `supabase/checks/20261125100000_anuncio_marcas_check.sql`
- Modify: `docs/BANCO.md` (nova subseção dentro de "Anúncios (Mercado Livre)")

**Interfaces:**
- Produces: tabela `public.anuncio_marcas (id, produto_id, canal, tipo, ml, created_at)`, único em `(produto_id, canal, tipo, coalesce(ml,0))`.

- [ ] **Step 1: Escrever a migration** com o SQL do spec (seção Banco), idempotente (`create table if not exists`, `create unique index if not exists`), RLS ligado e a policy padrão do projeto:
  `drop policy if exists "Acesso total autenticados" on public.anuncio_marcas; create policy "Acesso total autenticados" on public.anuncio_marcas for all to authenticated using (true) with check (true);`
- [ ] **Step 2: Escrever o check** no padrão de `supabase/checks/20261117_anuncios_check.sql` (`begin; do $$ ... $$; rollback;`): confere as 6 colunas; insere um frasco e um decant 5 para um produto existente; confirma que um segundo insert do mesmo frasco falha com `unique_violation`; que `tipo='decant', ml=null` falha com `check_violation`; termina com `raise notice 'anuncio_marcas ok'`.
- [ ] **Step 3: Documentar** a tabela em `docs/BANCO.md` (uma linha no estilo das vizinhas).
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20261125100000_anuncio_marcas.sql supabase/checks/20261125100000_anuncio_marcas_check.sql docs/BANCO.md
git commit -m "feat(anuncios): tabela anuncio_marcas para controle manual"
```

### Task 2: Lógica pura `controleAnuncios.ts`

**Files:**
- Create: `frontend/src/lib/controleAnuncios.ts`
- Test: `frontend/src/lib/__tests__/controleAnuncios.test.ts`

**Interfaces:**
- Produces:
```ts
export type Canal = 'ml' | 'shopify'
export type Variante = { tipo: 'frasco' | 'decant'; ml: number | null }
export type Marca = Variante & { produto_id: string; canal: Canal }
export type ProdutoControle = { id: string; nome: string; estoque_atual: number; vende_decant: boolean; ml_aberto: number | null }
export type EstadoCelula = 'verde' | 'vermelha' | 'cinza'
export type EstadoPerfume = 'completo' | 'aguardando' | 'incompleto' | 'sem_anuncio'
export type Celula = Variante & { estado: EstadoCelula; manual: boolean }   // manual = verde só por anuncio_marcas
export type LinhaControle = { produto: ProdutoControle; celulas: Celula[]; estado: EstadoPerfume }
export function variantesDo(p: ProdutoControle, tamanhos: number[]): Variante[]
export function montarLinhas(produtos: ProdutoControle[], canal: Canal, tamanhos: number[], manuais: Marca[], automaticas: Marca[]): LinhaControle[]
export function filtrarLinhas(linhas: LinhaControle[], situacao: EstadoPerfume | 'todos', busca: string): LinhaControle[]
export function paraMarcarTodas(linha: LinhaControle): Variante[]
```

- [ ] **Step 1: Escrever os testes** (helper `produto(over)` como em `estoqueDashboard.test.ts`, `tam = [2.5, 5, 10]`):
  - `variantesDo`: `vende_decant: true` → `[{frasco,null},{decant,2.5},{decant,5},{decant,10}]`; `false` → só frasco.
  - verde por marca manual → `{estado:'verde', manual:true}`; verde por automática → `manual:false`; manual + automática → `manual:false`.
  - `ml` como string: automática `{tipo:'decant', ml:'5' as unknown as number}` deixa a célula de 5 ml verde.
  - marca de outro canal não conta (marca `shopify` não pinta a grade `ml`).
  - cinza: frasco com `estoque_atual:0`; decant 10 com `estoque_atual:0, ml_aberto:8` → cinza, decant 5 → vermelha; decant com `estoque_atual:1, ml_aberto:null` → vermelha.
  - estados: tudo verde → `completo`; verdes + cinza sem vermelha → `aguardando`; tudo cinza → `aguardando`; vermelha + verde → `incompleto`; só vermelhas (+ cinzas) sem verde → `sem_anuncio`.
  - `filtrarLinhas`: por situação; busca `'asad'` e `'ASÁD'` acham "Asad Bourbon"; `'todos'` + busca vazia devolve tudo.
  - `paraMarcarTodas`: devolve só as variantes vermelhas.
  - ordem: `montarLinhas` devolve ordenado por `nome` (`localeCompare` pt-BR).
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/__tests__/controleAnuncios.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** conforme as regras do spec (seção "Regras"). Chave de variante: `tipo` + `Number(ml ?? 0)`. Decant de X ml disponível se `(ml_aberto ?? 0) >= X || estoque_atual > 0`; frasco disponível se `estoque_atual > 0`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/controleAnuncios.ts frontend/src/lib/__tests__/controleAnuncios.test.ts
git commit -m "feat(anuncios): lógica do controle de anúncios"
```

### Task 3: Tela Controle

**Files:**
- Create: `frontend/src/pages/anuncios/ControleAnuncios.tsx`
- Test: `frontend/src/pages/anuncios/__tests__/ControleAnuncios.test.tsx`
- Modify: `frontend/src/components/layout/Layout.tsx` (`ANU_NAV`, após `anuncios`: `{ id: 'controle', label: 'Controle', icon: 'check', path: '/anuncios/controle' }`)
- Modify: `frontend/src/App.tsx` (import + `<Route path="/anuncios/controle" element={<ControleAnuncios />} />` **antes** de `/anuncios/:id`)
- Modify: `docs/features/ANUNCIOS.md` (linha na tabela de Telas), `docs/HANDOFF_IA.md`, `docs/LOGS.md`

**Interfaces:**
- Consumes: tudo da Task 2; tabela da Task 1.
- Produces: `export function ControleAnuncios()`.

Carga (paralela, `Promise.all`):
- `produtos`: `select('id, nome, estoque_atual, tipos_produto(vende_decant)')` → `vende_decant` (ausente = `true`, produtos antigos são Perfume).
- `frascos_abertos`: `select('produto_id, ml_restante').eq('status','ativo')` → `ml_aberto`.
- `anuncios_config`: `select('tamanhos_decant').eq('id',1).maybeSingle()` → fallback `[2.5,5,10]`.
- Automáticas: `anuncios` `select('produto_id, tipo, ml').in('status',['publicado','pausado'])` com `canal:'ml'` + `canal_vinculos` `select('produto_id, canal, tipo, ml')`.
- Manuais: `anuncio_marcas` `select('produto_id, canal, tipo, ml')`.

Comportamento:
- Controles: seletor de plataforma (Mercado Livre / Shopify, default ML), select de situação (Todos, Completos, Aguardando estoque, Incompletos, Sem anúncio), busca.
- Cabeçalho das colunas: `Frasco`, depois `2,5 ml`, `5 ml`, `10 ml` (vírgula decimal). Perfume sem decant mostra `—` nessas colunas.
- Célula = botão redondo: verde com `check`, vermelha com `x`, cinza sem ícone; `aria-label` "`<nome>` `<variante>`: criado | falta criar | sem estoque".
  - vermelha ou cinza → `insert` em `anuncio_marcas`; verde manual → `delete` pela chave; verde automática → `disabled`, `title="vem do Horus"`.
  - erro `code === '23505'` no insert conta como sucesso; outro erro mostra mensagem na tela.
  - depois de gravar, recarrega só `anuncio_marcas`.
- Botão "Marcar todas" na linha quando `paraMarcarTodas(linha).length > 0` → um `insert` com o array.
- À direita: indicador (não clicável) com `check` quando `completo`; linha `completo` com fundo levemente diferente (classe com variável do tema, ex. `bg-gold/5`).

- [ ] **Step 1: Escrever os testes** (mock de `@/lib/supabase` no estilo de `FotosPerfume.test.tsx`, registrando `insert`/`delete` em `chamadas`; dados: Asad vende decant, estoque 1; Khamrah tudo marcado manualmente; Club sem decant, estoque 0):
  - renderiza as linhas e os cabeçalhos `Frasco`, `2,5 ml`, `5 ml`, `10 ml`.
  - clicar na célula vermelha "Asad Frasco" chama `insert({ produto_id:'p1', canal:'ml', tipo:'frasco', ml:null })`.
  - clicar numa verde manual chama `delete` com `eq` por `produto_id`, `canal`, `tipo`.
  - célula verde vinda de `anuncios` está `disabled` com `title` "vem do Horus".
  - "Marcar todas" do Asad faz um `insert` com as 4 variantes vermelhas.
  - insert que retorna `{ error: { code: '23505' } }` não mostra mensagem de erro.
  - filtro "Completos" mostra só Khamrah; trocar para Shopify deixa vermelhas as células que só tinham marca de `ml`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/pages/anuncios/__tests__/ControleAnuncios.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** a página, item do menu e rota.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; depois `npx vitest run` (suíte toda verde) e `npm run build` OK.
- [ ] **Step 5: Docs** — linha `/anuncios/controle` em `docs/features/ANUNCIOS.md`; item novo em `HANDOFF_IA.md` (com "migration `20261125100000_anuncio_marcas.sql` a aplicar pelo Luis antes do push") e entrada em `LOGS.md`.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/pages/anuncios/ControleAnuncios.tsx frontend/src/pages/anuncios/__tests__/ControleAnuncios.test.tsx frontend/src/components/layout/Layout.tsx frontend/src/App.tsx docs/features/ANUNCIOS.md docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "feat(anuncios): tela de controle de anúncios por plataforma"
```
