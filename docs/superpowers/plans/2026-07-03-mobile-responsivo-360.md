# Mobile Responsivo 360px Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React frontend reliable for daily operation on 360px-wide mobile screens.

**Architecture:** Keep the existing design system and add responsive behavior where current layouts are fixed-width. Use wrappers for wide tables, mobile-first grids for forms, stacked item rows for complex order/sale inputs, and compact modal spacing.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library.

---

### Task 1: Shared Responsive Modal

**Files:**
- Modify: `frontend/src/components/shared/Modal.tsx`
- Test: `frontend/src/components/shared/__tests__/Modal.test.tsx`

- [ ] Add a failing test that expects the modal to have mobile-safe margin, compact mobile padding, responsive title size and responsive body padding.
- [ ] Run `npm run test:run -- src/components/shared/__tests__/Modal.test.tsx` and verify the new test fails.
- [ ] Update `Modal.tsx` classes without adding `flex` or `flex-col` to the `dialog`.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Critical Tables And Headers

**Files:**
- Modify: `frontend/src/pages/estoque/Vendas.tsx`
- Modify: `frontend/src/pages/estoque/Pedidos.tsx`
- Modify: `frontend/src/pages/estoque/Divergencias.tsx`
- Modify: `frontend/src/pages/estoque/Fornecedores.tsx`
- Modify: `frontend/src/pages/estoque/Relatorios.tsx`
- Modify: `frontend/src/pages/financeiro/Transacoes.tsx`
- Modify: `frontend/src/pages/financeiro/Contas.tsx`
- Modify: `frontend/src/pages/financeiro/Metas.tsx`

- [ ] Add or update focused tests where existing tests cover table containers, starting with Vendas and Pedidos.
- [ ] Run focused tests and verify RED for missing responsive wrappers/classes.
- [ ] Wrap wide tables in `overflow-x-auto` and add `min-w-*` to table elements.
- [ ] Change page headers with actions to `flex-col sm:flex-row` and make mobile action groups wrap or fill width.
- [ ] Re-run focused tests and verify GREEN.

### Task 3: Mobile-First Forms

**Files:**
- Modify: `frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx`
- Modify: `frontend/src/pages/estoque/pedidos/ConferenciaModal.tsx`
- Modify: `frontend/src/pages/estoque/vendas/NovaVendaModal.tsx`
- Modify: `frontend/src/pages/estoque/vendas/VendaDetalheModal.tsx`
- Modify: `frontend/src/components/shared/ProductDetailsModal.tsx`
- Modify: `frontend/src/components/shared/EntradaRapidaModal.tsx`
- Modify: `frontend/src/components/shared/SaidaRapidaModal.tsx`
- Modify: `frontend/src/pages/financeiro/Transacoes.tsx`
- Modify: `frontend/src/pages/financeiro/Contas.tsx`
- Modify: `frontend/src/pages/financeiro/Metas.tsx`
- Modify: `frontend/src/pages/estoque/Produtos.tsx`

- [ ] Add focused tests for `NovoPedidoModal` and `NovaVendaModal` that assert complex item rows are mobile-stacked and desktop grid-preserving.
- [ ] Run focused tests and verify RED.
- [ ] Convert simple `grid-cols-2` forms to `grid-cols-1 sm:grid-cols-2`.
- [ ] Convert fixed item-row grids to `grid grid-cols-1 sm:grid-cols-[...]`.
- [ ] Update inline quick-create/import controls to wrap cleanly on mobile.
- [ ] Re-run focused tests and verify GREEN.

### Task 4: Full Verification And Docs

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] Run `npm run test:run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Update `docs/HANDOFF_IA.md` with the new session summary and current test/build status.
- [ ] Add a new `docs/LOGS.md` entry with what changed and verification results.
