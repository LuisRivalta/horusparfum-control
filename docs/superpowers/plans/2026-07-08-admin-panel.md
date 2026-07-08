# Painel Admin Simples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a minimal admin panel restricted to byhorusco@gmail.com for Supabase Auth user management and destructive database cleanup actions.

**Architecture:** Authorization is enforced in FastAPI with a get_admin_user dependency that validates the Supabase JWT and email. Admin operations run only in backend services using the existing service-role Supabase client. The React page only renders controls, collects confirmations, and calls /api/admin with the current session token.

**Tech Stack:** FastAPI, Supabase Python client, React 19, React Router 7, Vite, TypeScript, Vitest, Testing Library, unittest.

## Global Constraints

- Admin access is exclusive to byhorusco@gmail.com.
- No SQL livre in the browser or API.
- SUPABASE_SERVICE_ROLE_KEY stays backend-only.
- Deletions are destructive and require typing EXCLUIR in the frontend.
- The admin user cannot remove their own login.
- No persistent audit table in MVP; APIs return a deletion summary.
- Existing docs/HANDOFF_IA.md and docs/LOGS.md already have unrelated local edits; preserve them and do not revert them.

---

## File Structure

- Modify backend/app/auth/deps.py: add ADMIN_EMAIL and get_admin_user.
- Create backend/app/routers/admin.py: expose /api/admin users, list entities, and delete endpoints.
- Create backend/app/services/admin.py: focused Supabase service functions for user management, listing, deletion summaries, and explicit cascade routines.
- Modify backend/app/main.py: include admin router.
- Create backend/tests/test_admin_auth.py: admin dependency tests.
- Create backend/tests/test_admin_router.py: API tests with mocked services/dependencies.
- Create backend/tests/test_admin_service.py: deletion order and summary tests with fake Supabase tables.
- Create frontend/src/pages/admin/Admin.tsx: admin UI with Logins and Exclusoes tabs.
- Create frontend/src/pages/admin/__tests__/Admin.test.tsx: page behavior tests.
- Modify frontend/src/App.tsx: register /admin route.
- Modify frontend/src/components/shared/UserMenu.tsx: add optional admin link.
- Modify frontend/src/components/layout/Layout.tsx: pass admin flag and navigation handler to UserMenu.
- Update docs/HANDOFF_IA.md and docs/LOGS.md after implementation.

---

### Task 1: Backend Admin Authorization

**Files:**
- Modify: backend/app/auth/deps.py
- Create: backend/tests/test_admin_auth.py

**Interfaces:**
- Produces: ADMIN_EMAIL constant with value byhorusco@gmail.com.
- Produces: get_admin_user(user: dict = Depends(get_current_user)) -> dict.
- Consumes: get_current_user() -> dict with email and sub.

- [ ] **Step 1: Write the failing test**

Create backend/tests/test_admin_auth.py with direct dependency tests for allow and reject paths.

- [ ] **Step 2: Run test to verify it fails**

Run: cd backend && python -m unittest tests.test_admin_auth -v

Expected: FAIL because ADMIN_EMAIL or get_admin_user is missing.

- [ ] **Step 3: Write minimal implementation**

Add ADMIN_EMAIL = byhorusco@gmail.com and get_admin_user in backend/app/auth/deps.py. The dependency compares lowercased user email and raises HTTPException 403 with detail Acesso administrativo restrito when it differs.

- [ ] **Step 4: Run test to verify it passes**

Run: cd backend && python -m unittest tests.test_admin_auth -v

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Run: git add backend/app/auth/deps.py backend/tests/test_admin_auth.py

Run: git commit -m feat: add admin auth guard

---

### Task 2: Backend Admin Users API

**Files:**
- Create: backend/app/routers/admin.py
- Create: backend/app/services/admin.py
- Modify: backend/app/main.py
- Create: backend/tests/test_admin_router.py

**Interfaces:**
- Consumes: get_admin_user from Task 1.
- Produces: list_auth_users(supabase) -> list[dict].
- Produces: create_auth_user(supabase, email: str, password: str) -> dict.
- Produces: delete_auth_user(supabase, user_id: str, admin_email: str) -> dict.
- Produces routes GET /api/admin/users, POST /api/admin/users, DELETE /api/admin/users/{user_id}.

- [ ] **Step 1: Write failing router tests**

Create backend/tests/test_admin_router.py. Use TestClient(app), override get_admin_user to return {sub: admin-id, email: byhorusco@gmail.com}, and monkeypatch app.routers.admin.get_supabase with a fake client. Cover list users, create user, delete another user, and reject deleting the current admin email.

- [ ] **Step 2: Run test to verify it fails**

Run: cd backend && python -m unittest tests.test_admin_router -v

Expected: FAIL because admin router is missing.

- [ ] **Step 3: Implement service functions**

Create backend/app/services/admin.py. Normalize Supabase Auth user objects into dictionaries with id, email, created_at, last_sign_in_at. Implement list_auth_users, create_auth_user with email_confirm true, and delete_auth_user. delete_auth_user must raise HTTPException 400 when the target email is byhorusco@gmail.com.

- [ ] **Step 4: Implement router and register it**

Create backend/app/routers/admin.py with APIRouter, AdminCreateUserRequest model, and user endpoints using Depends(get_admin_user). Register it in backend/app/main.py under prefix /api/admin.

- [ ] **Step 5: Run focused tests**

Run: cd backend && python -m unittest tests.test_admin_router -v

Expected: PASS.

- [ ] **Step 6: Run backend suite**

Run: cd backend && python -m unittest discover -s tests

Expected: all backend tests pass.

- [ ] **Step 7: Commit**

Run: git add backend/app/main.py backend/app/routers/admin.py backend/app/services/admin.py backend/tests/test_admin_router.py

Run: git commit -m feat: add admin user endpoints

---

### Task 3: Backend Entity Listing and Delete Services

**Files:**
- Modify: backend/app/services/admin.py
- Modify: backend/app/routers/admin.py
- Create: backend/tests/test_admin_service.py

**Interfaces:**
- Produces: ADMIN_ENTITIES mapping entity key to table, select columns, search columns, label field.
- Produces: list_admin_entities(supabase, entity: str, search: str | None) -> list[dict].
- Produces: delete_admin_entity(supabase, entity: str, item_id: str) -> dict with deleted counters.
- Router consumes service through GET /api/admin/{entity} and DELETE /api/admin/{entity}/{item_id}.

- [ ] **Step 1: Write failing service tests**

Create backend/tests/test_admin_service.py with fake table objects recording operations. Cover simple direct delete for metas, venda cascade order, pedido cascade order, and produto cascade includes movimentacoes, pedido_itens, divergencias, frascos_abertos, decants, venda_itens, vendas, transacoes, then produtos.

- [ ] **Step 2: Run test to verify it fails**

Run: cd backend && python -m unittest tests.test_admin_service -v

Expected: FAIL because list/delete functions are missing.

- [ ] **Step 3: Implement entity listing**

Add ADMIN_ENTITIES for produtos, pedidos, vendas, transacoes, contas, metas, categorias, marcas, fornecedores, canais, embalagens. Listing selects stable display columns, limits to 50 rows, orders by created_at descending when available, and applies ilike search to the primary label when search is provided.

- [ ] **Step 4: Implement delete routines**

Implement explicit delete functions for venda, pedido, produto, and simple entities. For simple entities use table(entity.table).delete().eq(id, item_id).execute(). For cascades, query related ids first, delete child records in dependency order, update summary counters from returned data length, and stop on first exception.

- [ ] **Step 5: Wire router endpoints**

Add GET /api/admin/{entity}?search= and DELETE /api/admin/{entity}/{item_id}. Invalid entity returns 404 with Entidade administrativa invalida. Delete returns {deleted: summary}.

- [ ] **Step 6: Run focused tests**

Run: cd backend && python -m unittest tests.test_admin_service tests.test_admin_router -v

Expected: PASS.

- [ ] **Step 7: Commit**

Run: git add backend/app/routers/admin.py backend/app/services/admin.py backend/tests/test_admin_service.py backend/tests/test_admin_router.py

Run: git commit -m feat: add admin delete actions

---

### Task 4: Frontend Admin Page and Route

**Files:**
- Create: frontend/src/pages/admin/Admin.tsx
- Create: frontend/src/pages/admin/__tests__/Admin.test.tsx
- Modify: frontend/src/App.tsx

**Interfaces:**
- Consumes: useAuth() -> user, session, loading.
- Consumes backend routes from Tasks 2 and 3.
- Produces: Admin page component exported as Admin.
- Produces: /admin route inside ProtectedRoute/Layout tree.

- [ ] **Step 1: Write failing frontend tests**

Create frontend/src/pages/admin/__tests__/Admin.test.tsx. Mock AuthContext and fetch. Cover admin sees tabs Logins and Exclusoes, non-admin direct access sees Acesso administrativo restrito, creating a user posts to /api/admin/users with Authorization header, and delete confirmation button stays disabled until input equals EXCLUIR.

- [ ] **Step 2: Run test to verify it fails**

Run: cd frontend && npm run test:run -- src/pages/admin/__tests__/Admin.test.tsx

Expected: FAIL because Admin.tsx is missing.

- [ ] **Step 3: Implement Admin.tsx**

Create Admin.tsx with ADMIN_EMAIL constant, tabs state, users/items state, create-user form, entity select, search input, delete modal state, and fetch helpers. Use session.access_token for Authorization Bearer token. Use Button, Input, Select, and existing table/card styles.

- [ ] **Step 4: Register route**

Modify frontend/src/App.tsx to import Admin and add Route path /admin element <Admin /> inside the Layout protected route group.

- [ ] **Step 5: Run focused tests**

Run: cd frontend && npm run test:run -- src/pages/admin/__tests__/Admin.test.tsx

Expected: PASS.

- [ ] **Step 6: Commit**

Run: git add frontend/src/App.tsx frontend/src/pages/admin/Admin.tsx frontend/src/pages/admin/__tests__/Admin.test.tsx

Run: git commit -m feat: add admin panel page

---

### Task 5: Admin Navigation Entry

**Files:**
- Modify: frontend/src/components/shared/UserMenu.tsx
- Modify: frontend/src/components/layout/Layout.tsx
- Add or modify: frontend/src/components/shared/__tests__/UserMenu.test.tsx if present; otherwise cover via Admin route/Layout test.

**Interfaces:**
- Consumes: user.email from Layout.
- Produces: UserMenu props showAdminLink?: boolean and onAdminClick?: () -> void.

- [ ] **Step 1: Write failing navigation test**

Add a frontend test proving the Admin link appears when userEmail is byhorusco@gmail.com and does not appear for operador@example.com. If there is no UserMenu test file, create frontend/src/components/shared/__tests__/UserMenu.test.tsx with Testing Library.

- [ ] **Step 2: Run test to verify it fails**

Run: cd frontend && npm run test:run -- src/components/shared/__tests__/UserMenu.test.tsx

Expected: FAIL because UserMenu has no Admin action.

- [ ] **Step 3: Implement UserMenu admin link**

Add optional props showAdminLink and onAdminClick to UserMenu. When open and showAdminLink is true, render a button labeled Painel admin above Logout. It calls onAdminClick and closes the menu.

- [ ] **Step 4: Pass props from Layout**

In Layout, compute isAdmin = user?.email === byhorusco@gmail.com. Pass showAdminLink={isAdmin} and onAdminClick={() => navigate(/admin)} to UserMenu.

- [ ] **Step 5: Run focused tests**

Run: cd frontend && npm run test:run -- src/components/shared/__tests__/UserMenu.test.tsx

Expected: PASS.

- [ ] **Step 6: Run frontend suite and build**

Run: cd frontend && npm run test:run

Run: cd frontend && npm run build

Expected: tests and build pass.

- [ ] **Step 7: Commit**

Run: git add frontend/src/components/shared/UserMenu.tsx frontend/src/components/layout/Layout.tsx frontend/src/components/shared/__tests__/UserMenu.test.tsx

Run: git commit -m feat: expose admin panel link

---

### Task 6: Final Verification and Docs

**Files:**
- Modify: docs/HANDOFF_IA.md
- Modify: docs/LOGS.md

**Interfaces:**
- Consumes completed backend/frontend tasks.
- Produces updated handoff and logs for Session 54 or current session number used in docs.

- [ ] **Step 1: Run full verification**

Run: cd backend && python -m unittest discover -s tests

Run: cd frontend && npm run test:run

Run: cd frontend && npm run build

Expected: backend tests pass, frontend tests pass, build passes.

- [ ] **Step 2: Update docs**

Update docs/HANDOFF_IA.md with a short completed item for the admin panel and current verification counts. Add a docs/LOGS.md entry describing backend admin guard, user endpoints, delete actions, frontend /admin page, and tests run. Preserve existing unrelated doc edits.

- [ ] **Step 3: Check diff**

Run: git diff --check

Run: git status --short

Expected: no whitespace errors; only intended files modified.

- [ ] **Step 4: Commit docs**

Run: git add docs/HANDOFF_IA.md docs/LOGS.md

Run: git commit -m docs: registra painel admin simples

---
