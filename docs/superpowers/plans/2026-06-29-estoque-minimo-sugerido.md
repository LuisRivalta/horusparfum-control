# Estoque Minimo Sugerido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-calculated sales-based suggestion for each product's `estoque_minimo`, with a frontend action to apply the suggestion manually.

**Architecture:** Keep the calculation in FastAPI as a pure service plus a protected router endpoint. The React product details modal fetches the suggestion when opened and lets the user copy it into the existing `Estoque minimo` field without persisting automatically.

**Tech Stack:** FastAPI, Supabase service role client, Python `Decimal`, React 19, TypeScript, Vitest, Testing Library, unittest.

---

## File Structure

- Create `backend/app/services/estoque_minimo.py`: pure calculation for sales-based minimum stock suggestion.
- Create `backend/tests/test_estoque_minimo.py`: unit tests for calculation edge cases.
- Modify `backend/app/routers/estoque.py`: add `GET /api/estoque/produtos/{produto_id}/estoque-minimo-sugerido`.
- Create `backend/tests/test_estoque_minimo_router.py`: router tests with fake Supabase query chain.
- Modify `frontend/src/components/shared/ProductDetailsModal.tsx`: fetch suggestion, render status, apply suggestion to edit form.
- Modify `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`: add fetch mocks and UI tests for suggestion behavior.
- Modify `docs/HANDOFF_IA.md` and `docs/LOGS.md` at implementation finish.

## Task 1: Backend Pure Calculation

**Files:**
- Create: `backend/app/services/estoque_minimo.py`
- Test: `backend/tests/test_estoque_minimo.py`

- [ ] **Step 1: Write the failing service tests**

Create `backend/tests/test_estoque_minimo.py`:

```python
import sys
import types
import unittest

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.services.estoque_minimo import sugerir_estoque_minimo


class EstoqueMinimoServiceTest(unittest.TestCase):
    def test_calcula_sugestao_arredondando_para_cima(self):
        result = sugerir_estoque_minimo(
            produto_id="p1",
            unidades_vendidas=12,
            periodo_dias=90,
            dias_reposicao=15,
            margem_seguranca=0.3,
        )

        self.assertEqual(result["produto_id"], "p1")
        self.assertEqual(result["periodo_dias"], 90)
        self.assertEqual(result["unidades_vendidas"], 12)
        self.assertEqual(result["media_diaria"], 0.13)
        self.assertEqual(result["dias_reposicao"], 15)
        self.assertEqual(result["margem_seguranca"], 0.3)
        self.assertEqual(result["estoque_minimo_sugerido"], 3)
        self.assertTrue(result["tem_dados"])

    def test_retorna_minimo_um_quando_houve_venda_baixa(self):
        result = sugerir_estoque_minimo("p1", unidades_vendidas=1)

        self.assertEqual(result["estoque_minimo_sugerido"], 1)
        self.assertTrue(result["tem_dados"])

    def test_retorna_sem_dados_quando_nao_ha_vendas(self):
        result = sugerir_estoque_minimo("p1", unidades_vendidas=0)

        self.assertEqual(result["unidades_vendidas"], 0)
        self.assertEqual(result["media_diaria"], 0)
        self.assertIsNone(result["estoque_minimo_sugerido"])
        self.assertFalse(result["tem_dados"])

    def test_rejeita_periodo_dias_invalido(self):
        with self.assertRaises(ValueError):
            sugerir_estoque_minimo("p1", unidades_vendidas=1, periodo_dias=0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
cd backend
python -m unittest tests.test_estoque_minimo -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.estoque_minimo'`.

- [ ] **Step 3: Implement the pure calculation**

Create `backend/app/services/estoque_minimo.py`:

```python
from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from typing import Any

MEDIA_DECIMAIS = Decimal("0.01")
PERIODO_PADRAO_DIAS = 90
DIAS_REPOSICAO_PADRAO = 15
MARGEM_SEGURANCA_PADRAO = Decimal("0.3")


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _float_2(value: Decimal) -> float:
    return float(value.quantize(MEDIA_DECIMAIS, rounding=ROUND_HALF_UP))


def sugerir_estoque_minimo(
    produto_id: str,
    unidades_vendidas: int | Decimal,
    periodo_dias: int = PERIODO_PADRAO_DIAS,
    dias_reposicao: int = DIAS_REPOSICAO_PADRAO,
    margem_seguranca: float | Decimal = MARGEM_SEGURANCA_PADRAO,
) -> dict[str, Any]:
    if periodo_dias <= 0:
        raise ValueError("periodo_dias deve ser maior que zero")

    unidades = _decimal(unidades_vendidas)
    margem = _decimal(margem_seguranca)
    media_diaria = unidades / Decimal(periodo_dias)

    if unidades <= 0:
        return {
            "produto_id": produto_id,
            "periodo_dias": periodo_dias,
            "unidades_vendidas": 0,
            "media_diaria": 0,
            "dias_reposicao": dias_reposicao,
            "margem_seguranca": float(margem),
            "estoque_minimo_sugerido": None,
            "tem_dados": False,
        }

    bruto = media_diaria * Decimal(dias_reposicao) * (Decimal(1) + margem)
    sugerido = int(bruto.to_integral_value(rounding=ROUND_CEILING))
    if sugerido < 1:
        sugerido = 1

    return {
        "produto_id": produto_id,
        "periodo_dias": periodo_dias,
        "unidades_vendidas": int(unidades),
        "media_diaria": _float_2(media_diaria),
        "dias_reposicao": dias_reposicao,
        "margem_seguranca": float(margem),
        "estoque_minimo_sugerido": sugerido,
        "tem_dados": True,
    }
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
cd backend
python -m unittest tests.test_estoque_minimo -v
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/app/services/estoque_minimo.py backend/tests/test_estoque_minimo.py
git commit -m "feat(backend): calcula estoque minimo sugerido"
```

## Task 2: Backend Endpoint

**Files:**
- Modify: `backend/app/routers/estoque.py`
- Test: `backend/tests/test_estoque_minimo_router.py`

- [ ] **Step 1: Write the failing router tests**

Create `backend/tests/test_estoque_minimo_router.py`:

```python
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import get_current_user
from app.main import app


class FakeQuery:
    def __init__(self, table_name, calls):
        self.table_name = table_name
        self.calls = calls
        self.filters = []

    def select(self, columns):
        self.calls.append((self.table_name, "select", columns))
        return self

    def gte(self, field, value):
        self.filters.append(("gte", field, value))
        return self

    def neq(self, field, value):
        self.filters.append(("neq", field, value))
        return self

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def in_(self, field, values):
        self.filters.append(("in", field, list(values)))
        return self

    def execute(self):
        self.calls.append((self.table_name, "execute", list(self.filters)))
        if self.table_name == "vendas":
            return SimpleNamespace(data=[
                {"id": "v1", "status": "concluida", "data_venda": "2026-06-10"},
                {"id": "v2", "status": "concluida", "data_venda": "2026-06-12"},
            ])
        if self.table_name == "venda_itens":
            return SimpleNamespace(data=[
                {"id": "i1", "venda_id": "v1", "produto_id": "p1", "quantidade": 2},
                {"id": "i2", "venda_id": "v2", "produto_id": "p1", "quantidade": 10},
            ])
        return SimpleNamespace(data=[])


class FakeSupabase:
    def __init__(self):
        self.calls = []

    def table(self, table_name):
        self.calls.append(("table", table_name))
        return FakeQuery(table_name, self.calls)


class EstoqueMinimoRouterTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.previous_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1", "email": "user@example.com"}

    def tearDown(self):
        app.dependency_overrides = self.previous_overrides

    def test_retorna_sugestao_por_produto(self):
        fake_supabase = FakeSupabase()

        with patch("app.routers.estoque.get_supabase", return_value=fake_supabase):
            response = self.client.get("/api/estoque/produtos/p1/estoque-minimo-sugerido")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["produto_id"], "p1")
        self.assertEqual(payload["periodo_dias"], 90)
        self.assertEqual(payload["unidades_vendidas"], 12)
        self.assertEqual(payload["estoque_minimo_sugerido"], 3)
        self.assertTrue(payload["tem_dados"])
        self.assertEqual([call for call in fake_supabase.calls if call[0] == "table"], [
            ("table", "vendas"),
            ("table", "venda_itens"),
        ])
        venda_filters = [call[2] for call in fake_supabase.calls if call[0] == "vendas" and call[1] == "execute"][0]
        item_filters = [call[2] for call in fake_supabase.calls if call[0] == "venda_itens" and call[1] == "execute"][0]
        self.assertIn(("neq", "status", "cancelada"), venda_filters)
        self.assertIn(("eq", "produto_id", "p1"), item_filters)
        self.assertIn(("in", "venda_id", ["v1", "v2"]), item_filters)

    def test_sem_vendas_nao_consulta_itens(self):
        class EmptySupabase(FakeSupabase):
            def table(self, table_name):
                self.calls.append(("table", table_name))
                query = FakeQuery(table_name, self.calls)
                if table_name == "vendas":
                    query.execute = lambda: SimpleNamespace(data=[])
                return query

        fake_supabase = EmptySupabase()

        with patch("app.routers.estoque.get_supabase", return_value=fake_supabase):
            response = self.client.get("/api/estoque/produtos/p1/estoque-minimo-sugerido")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["tem_dados"])
        self.assertIsNone(payload["estoque_minimo_sugerido"])
        self.assertEqual([call for call in fake_supabase.calls if call[0] == "table"], [("table", "vendas")])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the router test to verify RED**

Run:

```bash
cd backend
python -m unittest tests.test_estoque_minimo_router -v
```

Expected: FAIL with HTTP 404 for `/api/estoque/produtos/p1/estoque-minimo-sugerido`.

- [ ] **Step 3: Add imports and endpoint**

Modify `backend/app/routers/estoque.py` imports:

```python
from datetime import datetime, timedelta, timezone
```

Add this import near other services:

```python
from app.services.estoque_minimo import PERIODO_PADRAO_DIAS, sugerir_estoque_minimo
```

Add this endpoint after `listar_produtos()`:

```python
@router.get("/produtos/{produto_id}/estoque-minimo-sugerido")
def estoque_minimo_sugerido(
    produto_id: str,
    _user: dict = Depends(get_current_user),
):
    hoje = datetime.now(timezone.utc).date()
    inicio = hoje - timedelta(days=PERIODO_PADRAO_DIAS - 1)

    try:
        supabase = get_supabase()
        vendas = (
            supabase
            .table("vendas")
            .select("id, status, data_venda")
            .gte("data_venda", inicio.isoformat())
            .neq("status", "cancelada")
            .execute()
            .data or []
        )
        venda_ids = [venda.get("id") for venda in vendas if venda.get("id") is not None]
        if not venda_ids:
            return sugerir_estoque_minimo(produto_id, unidades_vendidas=0)

        itens = (
            supabase
            .table("venda_itens")
            .select("id, venda_id, produto_id, quantidade")
            .in_("venda_id", venda_ids)
            .eq("produto_id", produto_id)
            .execute()
            .data or []
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao calcular estoque minimo sugerido: {exc}",
        )

    unidades_vendidas = sum(int(item.get("quantidade") or 0) for item in itens)
    return sugerir_estoque_minimo(produto_id, unidades_vendidas=unidades_vendidas)
```

- [ ] **Step 4: Run the router test to verify GREEN**

Run:

```bash
cd backend
python -m unittest tests.test_estoque_minimo_router -v
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Run backend full suite**

Run:

```bash
cd backend
python -m unittest discover tests -v
```

Expected: PASS, existing backend tests plus new service/router tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/app/routers/estoque.py backend/tests/test_estoque_minimo_router.py
git commit -m "feat(backend): expõe sugestao de estoque minimo"
```

## Task 3: Frontend Product Details Integration

**Files:**
- Modify: `frontend/src/components/shared/ProductDetailsModal.tsx`
- Modify: `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Modify the top of `frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx`.

Extend the hoisted mocks:

```ts
const { mockDeleteEq, mockRpc, mockUpdate, mockUpdateEq, mockGetSession } = vi.hoisted(() => ({
  mockDeleteEq: vi.fn(),
  mockRpc: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
  mockGetSession: vi.fn(),
}))
```

Extend the Supabase mock:

```ts
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
    rpc: mockRpc,
    from: vi.fn(() => ({
      update: mockUpdate,
      delete: vi.fn(() => ({
        eq: mockDeleteEq,
      })),
    })),
  },
}))
```

In `beforeEach`, add:

```ts
mockGetSession.mockResolvedValue({
  data: { session: { access_token: 'jwt-produto' } },
})
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    produto_id: 'p1',
    periodo_dias: 90,
    unidades_vendidas: 12,
    media_diaria: 0.13,
    dias_reposicao: 15,
    margem_seguranca: 0.3,
    estoque_minimo_sugerido: 3,
    tem_dados: true,
  }),
}))
```

Add `afterEach` after `beforeEach`:

```ts
afterEach(() => {
  vi.unstubAllGlobals()
})
```

Add tests inside `describe('ProductDetailsModal', () => { ... })`:

```ts
it('mostra sugestao de estoque minimo por vendas', async () => {
  render(
    <ProductDetailsModal
      open
      produto={produto}
      categorias={[{ id: 'c1', nome: 'Masculino' }]}
      fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
    />
  )

  expect(await screen.findByText(/sugestao por vendas/i)).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/estoque/produtos/p1/estoque-minimo-sugerido'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-produto' }),
    })
  )
})

it('usa sugestao para preencher estoque minimo no modo edicao', async () => {
  render(
    <ProductDetailsModal
      open
      produto={produto}
      categorias={[{ id: 'c1', nome: 'Masculino' }]}
      fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: /editar/i }))
  fireEvent.click(await screen.findByRole('button', { name: /usar sugestao/i }))

  expect(screen.getByLabelText(/estoque minimo/i)).toHaveValue(3)
})

it('mostra estado sem dados quando nao ha vendas suficientes', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      produto_id: 'p1',
      periodo_dias: 90,
      unidades_vendidas: 0,
      media_diaria: 0,
      dias_reposicao: 15,
      margem_seguranca: 0.3,
      estoque_minimo_sugerido: null,
      tem_dados: false,
    }),
  } as Response)

  render(
    <ProductDetailsModal
      open
      produto={produto}
      categorias={[{ id: 'c1', nome: 'Masculino' }]}
      fornecedores={[{ id: 'f1', nome: 'Cairo' }]}
      onClose={vi.fn()}
      onUpdated={vi.fn()}
      onDeleted={vi.fn()}
    />
  )

  expect(await screen.findByText(/ainda sem vendas suficientes/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run frontend focused test to verify RED**

Run:

```bash
cd frontend
npm run test:run -- src/components/shared/__tests__/ProductDetailsModal.test.tsx
```

Expected: FAIL because the modal does not fetch or render the suggestion yet.

- [ ] **Step 3: Add API URL, types, and state**

Modify imports in `frontend/src/components/shared/ProductDetailsModal.tsx`:

```ts
import { useEffect, useState } from 'react'
```

Add after imports:

```ts
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
```

Add type after `Produto`:

```ts
interface EstoqueMinimoSugestao {
  produto_id: string
  periodo_dias: number
  unidades_vendidas: number
  media_diaria: number
  dias_reposicao: number
  margem_seguranca: number
  estoque_minimo_sugerido: number | null
  tem_dados: boolean
}
```

Add state near existing `useState` calls:

```ts
const [sugestao, setSugestao] = useState<EstoqueMinimoSugestao | null>(null)
const [loadingSugestao, setLoadingSugestao] = useState(false)
const [sugestaoError, setSugestaoError] = useState<string | null>(null)
```

- [ ] **Step 4: Fetch suggestion when modal opens**

Add before `if (!produto) return null`:

```ts
useEffect(() => {
  if (!open || !produto) {
    setSugestao(null)
    setSugestaoError(null)
    setLoadingSugestao(false)
    return
  }

  let cancelled = false

  async function loadSugestao() {
    setLoadingSugestao(true)
    setSugestaoError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sessao expirada')

      const response = await fetch(`${API_URL}/api/estoque/produtos/${produto!.id}/estoque-minimo-sugerido`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Erro ao carregar sugestao')

      const payload = await response.json() as EstoqueMinimoSugestao
      if (!cancelled) setSugestao(payload)
    } catch {
      if (!cancelled) setSugestaoError('Nao foi possivel carregar sugestao por vendas.')
    } finally {
      if (!cancelled) setLoadingSugestao(false)
    }
  }

  loadSugestao()

  return () => {
    cancelled = true
  }
}, [open, produto?.id])
```

- [ ] **Step 5: Render suggestion and apply button**

In edit mode, replace the single `Input label="Estoque mínimo"` line with:

```tsx
<div className="flex flex-col gap-2">
  <Input label="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
  <SugestaoEstoqueMinimo
    sugestao={sugestao}
    loading={loadingSugestao}
    error={sugestaoError}
    onUse={(valor) => setForm({ ...form, estoque_minimo: String(valor) })}
  />
</div>
```

In read-only mode, after the `Estoque mínimo` display block, add:

```tsx
<div className="col-span-2">
  <SugestaoEstoqueMinimo
    sugestao={sugestao}
    loading={loadingSugestao}
    error={sugestaoError}
  />
</div>
```

Add this helper component at the bottom of the file, after `ProductDetailsModal`:

```tsx
function SugestaoEstoqueMinimo({
  sugestao,
  loading,
  error,
  onUse,
}: {
  sugestao: EstoqueMinimoSugestao | null
  loading: boolean
  error: string | null
  onUse?: (valor: number) => void
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-line bg-raise/40 px-3 py-2 text-xs text-muted">
        Calculando sugestao por vendas...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">
        {error}
      </div>
    )
  }

  if (!sugestao) return null

  if (!sugestao.tem_dados || sugestao.estoque_minimo_sugerido == null) {
    return (
      <div className="rounded-lg border border-line bg-raise/40 px-3 py-2 text-xs text-muted">
        Ainda sem vendas suficientes para sugerir.
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
      <div>
        <div className="text-xs uppercase tracking-wider text-gold">Sugestao por vendas</div>
        <div className="text-xs text-muted">
          {sugestao.unidades_vendidas} un. em {sugestao.periodo_dias} dias, reposicao de {sugestao.dias_reposicao} dias
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg text-text">{sugestao.estoque_minimo_sugerido}</span>
        {onUse && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onUse(sugestao.estoque_minimo_sugerido!)}>
            Usar sugestao
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run frontend focused test to verify GREEN**

Run:

```bash
cd frontend
npm run test:run -- src/components/shared/__tests__/ProductDetailsModal.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add frontend/src/components/shared/ProductDetailsModal.tsx frontend/src/components/shared/__tests__/ProductDetailsModal.test.tsx
git commit -m "feat(frontend): mostra estoque minimo sugerido"
```

## Task 4: Final Verification and Documentation

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Run full backend tests**

Run:

```bash
cd backend
python -m unittest discover tests -v
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```bash
cd frontend
npm run test:run
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Update docs**

In `docs/HANDOFF_IA.md`, update:

```md
> Última atualização: 2026-06-29 (Sessão 29)
```

Add a new completed item:

```md
35. **Estoque mínimo sugerido por vendas (Sessão 29)**
    - Backend `GET /api/estoque/produtos/{produto_id}/estoque-minimo-sugerido` calcula sugestão por vendas reais dos últimos 90 dias
    - Sugestão usa 15 dias de reposição e 30% de margem de segurança, ignorando vendas canceladas
    - Modal de detalhes/edição do produto exibe a sugestão e permite aplicar manualmente no campo `Estoque mínimo`
    - Sem vendas suficientes, o sistema não sugere zero artificialmente
    - Sem migração de banco
```

In `docs/LOGS.md`, add an entry near the top:

```md
## 2026-06-29 — Sessão 29: Estoque mínimo sugerido por vendas

- Criado cálculo backend para sugestão de `estoque_minimo` baseada em vendas reais.
- Adicionado endpoint protegido por JWT para consulta da sugestão por produto.
- Modal de produto passou a exibir a sugestão e o botão `Usar sugestão`.
- Testes backend/frontend e build frontend verificados.
```

- [ ] **Step 5: Commit docs and final state**

```bash
git add docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs: atualiza handoff do estoque minimo sugerido"
```

- [ ] **Step 6: Final git status**

Run:

```bash
git status --short
```

Expected: no changed tracked files related to this feature. Permission warnings for pytest cache directories can be ignored if they are unchanged/untracked cache folders.

## Self-Review

- Spec coverage: calculation, protected API, sales-only source, cancelada exclusion, no auto-update, frontend display/apply action, no-data state, tests, and docs are covered.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation steps are present.
- Type consistency: endpoint path, payload keys, and frontend `EstoqueMinimoSugestao` fields match the spec and backend service response.
