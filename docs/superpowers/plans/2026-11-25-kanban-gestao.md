# Kanban Gestão Implementation Plan

**Goal:** Módulo Gestão com quadro kanban (A fazer / Fazendo / Feito).
**Architecture:** Tabela `tarefas`; lógica pura em `lib/kanban.ts`; página `pages/gestao/Kanban.tsx` com drag nativo e modal.
**Tech Stack:** React + TS + Tailwind, Supabase JS, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-25-kanban-gestao-design.md`

## Global Constraints
- Sem dependência nova. Migration aplicada pelo Luis (não usar MCP do Supabase).
- Commits sem Co-Authored-By, na main, sem push.

## Review Focus
- Soltar o cartão sobre ele mesmo → nada muda (sem update); Task 2.
- Soltar entre dois cartões com a mesma ordem → ordem ainda fica entre/igual sem quebrar; Task 1.
- Título só com espaços → não salva; Task 2.
- Prazo vencido em "Feito" → sem destaque; Task 1.
- Fuso: prazo `date` comparado como texto `aaaa-mm-dd` com o dia local; Task 1.

### Task 1: banco + `lib/kanban.ts`
- Migration + check (`supabase/checks/20261125110000_tarefas_check.sql`: colunas, check de status e título vazio, rollback).
- `export type Status = 'a_fazer' | 'fazendo' | 'feito'`; `export const COLUNAS: { status: Status; titulo: string }[]`; `export interface Tarefa { id; titulo; descricao: string | null; prazo: string | null; status: Status; ordem: number }`;
  `agrupar(ts: Tarefa[]): Record<Status, Tarefa[]>` (ordenado por ordem); `ordemAoSoltar(coluna: Tarefa[], antesDeId: string | null, movidaId: string): number` (ignora a própria movida; antes do primeiro = primeira − 1; fim = última + 1; vazia = 0; meio = média);
  `situacaoPrazo(t: Tarefa, hoje: string): 'atrasado' | 'hoje' | null`; `hojeLocal(d?: Date): string`.
- Tests em `lib/__tests__/kanban.test.ts`.

### Task 2: página, módulo e docs
- `pages/gestao/Kanban.tsx` (`export function Kanban()`), rota `/gestao`, `Modulo` ganha `'gestao'`, `GES_NAV = [{ id: 'quadro', label: 'Quadro', icon: 'grid', path: '/gestao' }]`, largura do indicador do seletor por `MODULOS.length`, card na Home.
- Tests `pages/gestao/__tests__/Kanban.test.tsx`: mostra cartões nas colunas; criar envia insert com título/descrição/prazo e status a_fazer; título vazio não envia; botão → manda update status fazendo; drop sobre cartão grava ordem média; editar e excluir.
- Docs: `docs/features/GESTAO.md`, BANCO.md, HANDOFF, LOGS, 00-INDEX se listar features.
