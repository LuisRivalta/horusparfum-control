# Importacao PDF com Parser Robusto e Match Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar a importacao de PDFs de pedidos para extrair corretamente itens Onuh e reconhecer produtos cadastrados por similaridade quando o nome nao for identico.

**Architecture:** O backend continua responsavel por transformar PDF textual em itens estruturados, sem acessar banco. O frontend continua responsavel por casar cada item importado com os produtos ja carregados no modal, agora usando matching exato seguido de fuzzy match deterministico.

**Tech Stack:** FastAPI/Python, pypdf, React/Vite/TypeScript, Vitest, unittest.

---

### Task 1: Parser backend Onuh

**Files:**
- Modify: `backend/app/services/pedido_pdf_import.py`
- Test: `backend/tests/test_pedido_pdf_import.py`

- [ ] **Step 1: Write failing tests**

Add tests for inline rows such as `ARMAF I AM KAYA BODY SPRAY 200ML NCM: 3303.00.10 1,00 un 59,99 59,99`, header noise before the table, and declared item count mismatch warnings.

- [ ] **Step 2: Run backend focused test**

Run: `python -m unittest backend.tests.test_pedido_pdf_import`
Expected: FAIL because the current parser merges header text and inline rows.

- [ ] **Step 3: Implement parser fix**

Add table-start detection, footer stop detection, inline row parsing, better code/GTIN/NCM cleanup, and declared item count validation.

- [ ] **Step 4: Verify backend focused test**

Run: `python -m unittest backend.tests.test_pedido_pdf_import`
Expected: PASS.

### Task 2: Fuzzy matching frontend

**Files:**
- Modify: `frontend/src/lib/pedidoPdfImport.ts`
- Test: `frontend/src/lib/__tests__/pedidoPdfImport.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests where `MAISON ALHAMBRA MAISON MAITRE DE BLUE EDP 100ML` matches a shorter registered name, where volume mismatch prevents auto-match, and where two similar products remain ambiguous.

- [ ] **Step 2: Run frontend focused test**

Run: `cd frontend && npm run test:run -- src/lib/__tests__/pedidoPdfImport.test.ts`
Expected: FAIL because matching is exact only.

- [ ] **Step 3: Implement matching fix**

Keep exact normalized matching first. Add token similarity, volume extraction, confidence threshold, and ambiguity detection.

- [ ] **Step 4: Verify frontend focused test**

Run: `cd frontend && npm run test:run -- src/lib/__tests__/pedidoPdfImport.test.ts`
Expected: PASS.

### Task 3: Final verification and docs

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Run full backend tests**

Run: `cd backend && python -m unittest discover`
Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run: `cd frontend && npm run test:run`
Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Update docs**

Record the parser and fuzzy matching improvement in `docs/HANDOFF_IA.md` and prepend a log entry in `docs/LOGS.md`.
