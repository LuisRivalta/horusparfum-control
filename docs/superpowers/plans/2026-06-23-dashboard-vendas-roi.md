# Dashboard de Vendas e ROI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-calculated sales and ROI dashboard inside `/estoque/vendas`, preserving the current sales list workflow.

**Architecture:** The FastAPI backend exposes `GET /api/estoque/vendas/dashboard` and computes all monetary metrics with Python `Decimal`, using Supabase service role on the server. The frontend adds a Dashboard tab next to the existing sales list, reuses the financial period selector, and renders KPI cards, a monthly chart, rankings, and a period sales table from the endpoint response.

**Tech Stack:** FastAPI, Supabase Python client, Python `unittest`, React 19, TypeScript, Vite, Vitest, Testing Library, Recharts, Tailwind CSS.

---

## File Structure

- Create `backend/app/services/vendas_dashboard.py`: pure calculation service for summary, evolution, product ranking, channel ranking, and sales table payload.
- Create `backend/tests/test_vendas_dashboard.py`: TDD coverage for the pure backend service.
- Modify `backend/app/routers/estoque.py`: add protected dashboard endpoint while leaving existing endpoints intact.
- Create `backend/tests/test_estoque_vendas_dashboard_router.py`: endpoint-level tests for invalid period and Supabase query flow.
- Create `frontend/src/pages/estoque/vendas/VendasDashboard.tsx`: dashboard tab UI and API fetch logic.
- Create `frontend/src/pages/estoque/__tests__/VendasDashboard.test.tsx`: TDD coverage for fetch, render, empty, and error states.
- Modify `frontend/src/pages/estoque/Vendas.tsx`: add `Lista` and `Dashboard` tabs and render `VendasDashboard`.
- Modify `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`: preserve list tests and add tab navigation coverage.
- Modify `docs/HANDOFF_IA.md` and `docs/LOGS.md`: document implementation and verification after code is complete.

---

### Task 1: Backend Calculation Service

**Files:**
- Create: `backend/app/services/vendas_dashboard.py`
- Test: `backend/tests/test_vendas_dashboard.py`

- [ ] **Step 1: Write the failing service tests**

Create `backend/tests/test_vendas_dashboard.py` with this content:

```python
import unittest
from datetime import datetime, timezone

from app.services.financeiro_relatorios import parse_iso_datetime
from app.services.vendas_dashboard import montar_dashboard_vendas


class VendasDashboardServiceTest(unittest.TestCase):
    def test_monta_resumo_rankings_e_tabela_ignorando_canceladas(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "240.00",
                "total_custo": "132.00",
                "lucro_bruto": "78.00",
                "taxa_total": "24.00",
                "frete": "6.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            },
            {
                "id": "v2",
                "numero": 11,
                "status": "concluida",
                "data_venda": "2026-06-11",
                "total_bruto": "110.00",
                "total_custo": "58.00",
                "lucro_bruto": "37.00",
                "taxa_total": "10.00",
                "frete": "5.00",
                "canal_id": "c2",
                "created_at": "2026-06-11T12:00:00+00:00",
            },
            {
                "id": "v3",
                "numero": 12,
                "status": "cancelada",
                "data_venda": "2026-06-12",
                "total_bruto": "999.00",
                "total_custo": "100.00",
                "lucro_bruto": "899.00",
                "taxa_total": "0.00",
                "frete": "0.00",
                "canal_id": "c1",
                "created_at": "2026-06-12T12:00:00+00:00",
            },
        ]
        itens = [
            {
                "id": "i1",
                "venda_id": "v1",
                "tipo": "produto",
                "produto_id": "p1",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "200.00",
                "custo_unitario": "120.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "20.00",
                "frete_rateado": "5.00",
                "lucro": "55.00",
            },
            {
                "id": "i2",
                "venda_id": "v1",
                "tipo": "decant",
                "produto_id": "p2",
                "quantidade": 1,
                "ml": 5,
                "preco_unitario": "40.00",
                "custo_unitario": "10.00",
                "custo_embalagem": "2.00",
                "taxa_rateada": "4.00",
                "frete_rateado": "1.00",
                "lucro": "23.00",
            },
            {
                "id": "i3",
                "venda_id": "v2",
                "tipo": "produto",
                "produto_id": "p1",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "110.00",
                "custo_unitario": "58.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "10.00",
                "frete_rateado": "5.00",
                "lucro": "37.00",
            },
            {
                "id": "i4",
                "venda_id": "v3",
                "tipo": "produto",
                "produto_id": "p3",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "999.00",
                "custo_unitario": "100.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "0.00",
                "frete_rateado": "0.00",
                "lucro": "899.00",
            },
        ]
        canais = [
            {"id": "c1", "nome": "Shopee"},
            {"id": "c2", "nome": "Loja fisica"},
        ]
        produtos = [
            {"id": "p1", "nome": "Asad Lattafa"},
            {"id": "p2", "nome": "Decant Badee"},
            {"id": "p3", "nome": "Cancelado"},
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            itens,
            canais,
            produtos,
            parse_iso_datetime("2026-06-01T00:00:00Z"),
            parse_iso_datetime("2026-06-30T23:59:59Z"),
        )

        self.assertEqual(dashboard["resumo"]["qtd_vendas"], 2)
        self.assertEqual(dashboard["resumo"]["itens_vendidos"], 3)
        self.assertEqual(dashboard["resumo"]["faturamento_bruto"], 350.0)
        self.assertEqual(dashboard["resumo"]["total_custo"], 190.0)
        self.assertEqual(dashboard["resumo"]["lucro_bruto"], 115.0)
        self.assertEqual(dashboard["resumo"]["margem_media"], 32.86)
        self.assertEqual(dashboard["resumo"]["roi_medio"], 60.53)
        self.assertEqual(dashboard["resumo"]["ticket_medio"], 175.0)
        self.assertEqual(dashboard["produtos"][0]["nome"], "Asad Lattafa")
        self.assertEqual(dashboard["produtos"][0]["quantidade"], 2)
        self.assertEqual(dashboard["produtos"][0]["lucro_bruto"], 92.0)
        self.assertEqual(dashboard["canais"][0]["nome"], "Shopee")
        self.assertEqual(dashboard["canais"][0]["qtd_vendas"], 1)
        self.assertEqual([v["numero"] for v in dashboard["vendas"]], [11, 10])
        self.assertNotIn("Cancelado", [p["nome"] for p in dashboard["produtos"]])

    def test_evolucao_preenche_meses_sem_vendas_com_zero(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "240.00",
                "total_custo": "132.00",
                "lucro_bruto": "78.00",
                "taxa_total": "24.00",
                "frete": "6.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            }
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            [],
            [{"id": "c1", "nome": "Shopee"}],
            [],
            parse_iso_datetime("2026-06-01T00:00:00Z"),
            parse_iso_datetime("2026-08-31T23:59:59Z"),
        )

        self.assertEqual(
            dashboard["evolucao"],
            [
                {"periodo": "2026-06", "label": "Jun/26", "faturamento_bruto": 240.0, "lucro_bruto": 78.0},
                {"periodo": "2026-07", "label": "Jul/26", "faturamento_bruto": 0.0, "lucro_bruto": 0.0},
                {"periodo": "2026-08", "label": "Ago/26", "faturamento_bruto": 0.0, "lucro_bruto": 0.0},
            ],
        )

    def test_roi_fica_nulo_quando_custo_total_e_zero(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "100.00",
                "total_custo": "0.00",
                "lucro_bruto": "100.00",
                "taxa_total": "0.00",
                "frete": "0.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            }
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            [],
            [{"id": "c1", "nome": "Loja fisica"}],
            [],
            datetime(2026, 6, 1, tzinfo=timezone.utc),
            datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc),
        )

        self.assertIsNone(dashboard["resumo"]["roi_medio"])
        self.assertIsNone(dashboard["canais"][0]["roi"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run service tests to verify RED**

Run:

```bash
cd C:\Horus\backend
python -m unittest tests.test_vendas_dashboard -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.vendas_dashboard'`.

- [ ] **Step 3: Implement the pure dashboard service**

Create `backend/app/services/vendas_dashboard.py` with this content:

```python
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


CENTAVOS = Decimal("0.01")
PERCENTUAL = Decimal("0.01")
MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _to_float(value: Decimal) -> float:
    return float(value.quantize(CENTAVOS, rounding=ROUND_HALF_UP))


def _to_percent(numerador: Decimal, denominador: Decimal, null_when_zero: bool = False) -> float | None:
    if denominador <= 0:
        return None if null_when_zero else 0.0
    return float((numerador / denominador * Decimal(100)).quantize(PERCENTUAL, rounding=ROUND_HALF_UP))


def _sale_date(row: dict[str, Any]) -> date:
    return date.fromisoformat(str(row["data_venda"]))


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _next_month(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def _month_key(value: date) -> str:
    return f"{value.year}-{value.month:02d}"


def _month_label(value: date) -> str:
    return f"{MESES_CURTOS[value.month - 1]}/{str(value.year)[2:]}"


def _iter_months(inicio: datetime, fim: datetime) -> list[date]:
    atual = _month_start(inicio.date())
    ultimo = _month_start(fim.date())
    meses: list[date] = []
    while atual <= ultimo:
        meses.append(atual)
        atual = _next_month(atual)
    return meses


def _nome_por_id(rows: list[dict[str, Any]], fallback: str) -> dict[str, str]:
    nomes: dict[str, str] = {}
    for row in rows:
        row_id = row.get("id")
        if row_id:
            nome = row.get("nome")
            nomes[str(row_id)] = str(nome).strip() if nome else fallback
    return nomes


def _venda_payload(
    venda: dict[str, Any],
    itens_da_venda: list[dict[str, Any]],
    canais: dict[str, str],
) -> dict[str, Any]:
    bruto = _money(venda.get("total_bruto"))
    custo = _money(venda.get("total_custo"))
    lucro = _money(venda.get("lucro_bruto"))
    canal_id = str(venda.get("canal_id") or "")
    return {
        "id": venda.get("id"),
        "numero": venda.get("numero"),
        "data_venda": venda.get("data_venda"),
        "canal": canais.get(canal_id, "Sem canal"),
        "itens": len(itens_da_venda),
        "faturamento_bruto": _to_float(bruto),
        "total_custo": _to_float(custo),
        "lucro_bruto": _to_float(lucro),
        "margem": _to_percent(lucro, bruto),
        "roi": _to_percent(lucro, custo, null_when_zero=True),
    }


def montar_dashboard_vendas(
    vendas: list[dict[str, Any]],
    itens: list[dict[str, Any]],
    canais: list[dict[str, Any]],
    produtos: list[dict[str, Any]],
    inicio: datetime,
    fim: datetime,
) -> dict[str, Any]:
    if inicio > fim:
        raise ValueError("Periodo invalido")

    inicio_date = inicio.date()
    fim_date = fim.date()
    vendas_validas = [
        venda
        for venda in vendas
        if venda.get("status") == "concluida" and inicio_date <= _sale_date(venda) <= fim_date
    ]
    vendas_validas.sort(key=lambda venda: (_sale_date(venda), int(venda.get("numero") or 0)), reverse=True)
    venda_ids = {str(venda.get("id")) for venda in vendas_validas}

    itens_por_venda: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in itens:
        venda_id = str(item.get("venda_id") or "")
        if venda_id in venda_ids:
            itens_por_venda[venda_id].append(item)

    canais_por_id = _nome_por_id(canais, "Sem canal")
    produtos_por_id = _nome_por_id(produtos, "Sem produto")

    total_bruto = sum((_money(venda.get("total_bruto")) for venda in vendas_validas), Decimal(0))
    total_custo = sum((_money(venda.get("total_custo")) for venda in vendas_validas), Decimal(0))
    lucro_bruto = sum((_money(venda.get("lucro_bruto")) for venda in vendas_validas), Decimal(0))
    qtd_vendas = len(vendas_validas)
    itens_vendidos = sum(
        int(item.get("quantidade") or 0)
        for venda_id in venda_ids
        for item in itens_por_venda.get(venda_id, [])
    )

    produtos_agregados: dict[str, dict[str, Any]] = {}
    for venda_id in venda_ids:
        for item in itens_por_venda.get(venda_id, []):
            produto_id = str(item.get("produto_id") or "")
            if not produto_id:
                continue
            atual = produtos_agregados.setdefault(
                produto_id,
                {
                    "produto_id": produto_id,
                    "nome": produtos_por_id.get(produto_id, "Sem produto"),
                    "quantidade": 0,
                    "faturamento_bruto": Decimal(0),
                    "custo": Decimal(0),
                    "lucro_bruto": Decimal(0),
                },
            )
            quantidade = int(item.get("quantidade") or 0)
            atual["quantidade"] += quantidade
            atual["faturamento_bruto"] += _money(item.get("preco_unitario")) * Decimal(quantidade)
            atual["custo"] += (_money(item.get("custo_unitario")) + _money(item.get("custo_embalagem"))) * Decimal(quantidade)
            atual["lucro_bruto"] += _money(item.get("lucro"))

    produtos_payload = []
    for item in produtos_agregados.values():
        bruto = item["faturamento_bruto"]
        custo = item["custo"]
        lucro = item["lucro_bruto"]
        produtos_payload.append(
            {
                "produto_id": item["produto_id"],
                "nome": item["nome"],
                "quantidade": item["quantidade"],
                "faturamento_bruto": _to_float(bruto),
                "lucro_bruto": _to_float(lucro),
                "margem": _to_percent(lucro, bruto),
                "roi": _to_percent(lucro, custo, null_when_zero=True),
            }
        )
    produtos_payload.sort(key=lambda item: item["lucro_bruto"], reverse=True)

    canais_agregados: dict[str, dict[str, Any]] = {}
    for venda in vendas_validas:
        canal_id = str(venda.get("canal_id") or "")
        atual = canais_agregados.setdefault(
            canal_id,
            {
                "canal_id": canal_id or None,
                "nome": canais_por_id.get(canal_id, "Sem canal"),
                "qtd_vendas": 0,
                "faturamento_bruto": Decimal(0),
                "total_custo": Decimal(0),
                "lucro_bruto": Decimal(0),
            },
        )
        atual["qtd_vendas"] += 1
        atual["faturamento_bruto"] += _money(venda.get("total_bruto"))
        atual["total_custo"] += _money(venda.get("total_custo"))
        atual["lucro_bruto"] += _money(venda.get("lucro_bruto"))

    canais_payload = []
    for item in canais_agregados.values():
        bruto = item["faturamento_bruto"]
        custo = item["total_custo"]
        lucro = item["lucro_bruto"]
        canais_payload.append(
            {
                "canal_id": item["canal_id"],
                "nome": item["nome"],
                "qtd_vendas": item["qtd_vendas"],
                "faturamento_bruto": _to_float(bruto),
                "lucro_bruto": _to_float(lucro),
                "margem": _to_percent(lucro, bruto),
                "roi": _to_percent(lucro, custo, null_when_zero=True),
            }
        )
    canais_payload.sort(key=lambda item: item["lucro_bruto"], reverse=True)

    evolucao_map: dict[str, dict[str, Decimal]] = {
        _month_key(mes): {"faturamento_bruto": Decimal(0), "lucro_bruto": Decimal(0)}
        for mes in _iter_months(inicio, fim)
    }
    for venda in vendas_validas:
        key = _month_key(_sale_date(venda))
        if key not in evolucao_map:
            evolucao_map[key] = {"faturamento_bruto": Decimal(0), "lucro_bruto": Decimal(0)}
        evolucao_map[key]["faturamento_bruto"] += _money(venda.get("total_bruto"))
        evolucao_map[key]["lucro_bruto"] += _money(venda.get("lucro_bruto"))

    evolucao = []
    for mes in _iter_months(inicio, fim):
        key = _month_key(mes)
        ponto = evolucao_map[key]
        evolucao.append(
            {
                "periodo": key,
                "label": _month_label(mes),
                "faturamento_bruto": _to_float(ponto["faturamento_bruto"]),
                "lucro_bruto": _to_float(ponto["lucro_bruto"]),
            }
        )

    ticket_medio = Decimal(0) if qtd_vendas == 0 else total_bruto / Decimal(qtd_vendas)

    return {
        "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat()},
        "resumo": {
            "qtd_vendas": qtd_vendas,
            "itens_vendidos": itens_vendidos,
            "faturamento_bruto": _to_float(total_bruto),
            "total_custo": _to_float(total_custo),
            "lucro_bruto": _to_float(lucro_bruto),
            "margem_media": _to_percent(lucro_bruto, total_bruto),
            "roi_medio": _to_percent(lucro_bruto, total_custo, null_when_zero=True),
            "ticket_medio": _to_float(ticket_medio),
        },
        "evolucao": evolucao,
        "produtos": produtos_payload[:10],
        "canais": canais_payload,
        "vendas": [
            _venda_payload(venda, itens_por_venda.get(str(venda.get("id")), []), canais_por_id)
            for venda in vendas_validas
        ],
    }
```

- [ ] **Step 4: Run service tests to verify GREEN**

Run:

```bash
cd C:\Horus\backend
python -m unittest tests.test_vendas_dashboard -v
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
cd C:\Horus
git add backend\app\services\vendas_dashboard.py backend\tests\test_vendas_dashboard.py
git commit -m "feat(api): calcula dashboard de vendas"
```

---

### Task 2: Backend Protected Endpoint

**Files:**
- Modify: `backend/app/routers/estoque.py`
- Test: `backend/tests/test_estoque_vendas_dashboard_router.py`

- [ ] **Step 1: Write the failing router tests**

Create `backend/tests/test_estoque_vendas_dashboard_router.py` with this content:

```python
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from app.routers.estoque import vendas_dashboard


class FakeQuery:
    def __init__(self, data):
        self.data = data

    def select(self, _columns):
        return self

    def gte(self, _column, _value):
        return self

    def lte(self, _column, _value):
        return self

    def in_(self, _column, _values):
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(self):
        self.calls = []
        self.tables = {
            "vendas": [
                {
                    "id": "v1",
                    "numero": 1,
                    "status": "concluida",
                    "data_venda": "2026-06-10",
                    "total_bruto": "100.00",
                    "total_custo": "60.00",
                    "lucro_bruto": "40.00",
                    "taxa_total": "0.00",
                    "frete": "0.00",
                    "canal_id": "c1",
                    "created_at": "2026-06-10T12:00:00+00:00",
                }
            ],
            "venda_itens": [
                {
                    "id": "i1",
                    "venda_id": "v1",
                    "tipo": "produto",
                    "produto_id": "p1",
                    "quantidade": 1,
                    "ml": None,
                    "preco_unitario": "100.00",
                    "custo_unitario": "60.00",
                    "custo_embalagem": "0.00",
                    "taxa_rateada": "0.00",
                    "frete_rateado": "0.00",
                    "lucro": "40.00",
                }
            ],
            "canais": [{"id": "c1", "nome": "Loja fisica"}],
            "produtos": [{"id": "p1", "nome": "Asad Lattafa"}],
        }

    def table(self, name):
        self.calls.append(name)
        return FakeQuery(self.tables[name])


class VendasDashboardRouterTest(unittest.TestCase):
    def test_periodo_invalido_retorna_400(self):
        with self.assertRaises(HTTPException) as raised:
            vendas_dashboard(
                inicio="2026-07-01T00:00:00Z",
                fim="2026-06-01T00:00:00Z",
                _user={"sub": "u1"},
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "Inicio deve ser menor ou igual ao fim")

    def test_endpoint_consulta_supabase_e_retorna_dashboard(self):
        fake = FakeSupabase()

        with patch("app.routers.estoque.get_supabase", return_value=fake):
            response = vendas_dashboard(
                inicio="2026-06-01T00:00:00Z",
                fim="2026-06-30T23:59:59Z",
                _user={"sub": "u1"},
            )

        self.assertEqual(fake.calls, ["vendas", "venda_itens", "canais", "produtos"])
        self.assertEqual(response["resumo"]["qtd_vendas"], 1)
        self.assertEqual(response["resumo"]["faturamento_bruto"], 100.0)
        self.assertEqual(response["produtos"][0]["nome"], "Asad Lattafa")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run router tests to verify RED**

Run:

```bash
cd C:\Horus\backend
python -m unittest tests.test_estoque_vendas_dashboard_router -v
```

Expected: FAIL with `ImportError` because `vendas_dashboard` is not defined in `app.routers.estoque`.

- [ ] **Step 3: Implement the endpoint**

Replace `backend/app/routers/estoque.py` with this content:

```python
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.deps import get_current_user
from app.db.supabase import get_supabase
from app.services.financeiro_relatorios import parse_iso_datetime
from app.services.vendas_dashboard import montar_dashboard_vendas

router = APIRouter()


@router.get("/produtos")
def listar_produtos():
    return {"produtos": []}


@router.get("/movimentacoes")
def listar_movimentacoes():
    return {"movimentacoes": []}


@router.get("/categorias")
def listar_categorias():
    return {"categorias": []}


@router.get("/fornecedores")
def listar_fornecedores():
    return {"fornecedores": []}


@router.get("/alertas")
def listar_alertas():
    return {"alertas": []}


@router.get("/vendas/dashboard")
def vendas_dashboard(
    inicio: str,
    fim: str,
    _user: dict = Depends(get_current_user),
):
    try:
        inicio_dt = parse_iso_datetime(inicio)
        fim_dt = parse_iso_datetime(fim)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Periodo invalido",
        )

    if inicio_dt > fim_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inicio deve ser menor ou igual ao fim",
        )

    try:
        supabase = get_supabase()
        vendas_result = (
            supabase
            .table("vendas")
            .select("id, numero, status, data_venda, total_bruto, total_custo, lucro_bruto, taxa_total, frete, canal_id, created_at")
            .gte("data_venda", inicio_dt.date().isoformat())
            .lte("data_venda", fim_dt.date().isoformat())
            .execute()
        )
        vendas = vendas_result.data or []
        venda_ids = [row["id"] for row in vendas if row.get("id")]

        if venda_ids:
            itens = (
                supabase
                .table("venda_itens")
                .select("id, venda_id, tipo, produto_id, quantidade, ml, preco_unitario, custo_unitario, custo_embalagem, taxa_rateada, frete_rateado, lucro")
                .in_("venda_id", venda_ids)
                .execute()
                .data
                or []
            )
        else:
            itens = []

        canais = (
            supabase
            .table("canais")
            .select("id, nome")
            .execute()
            .data
            or []
        )
        produtos = (
            supabase
            .table("produtos")
            .select("id, nome")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao consultar vendas: {exc}",
        )

    return montar_dashboard_vendas(vendas, itens, canais, produtos, inicio_dt, fim_dt)
```

- [ ] **Step 4: Run router tests to verify GREEN**

Run:

```bash
cd C:\Horus\backend
python -m unittest tests.test_estoque_vendas_dashboard_router -v
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Run backend focused tests**

Run:

```bash
cd C:\Horus\backend
python -m unittest tests.test_vendas_dashboard tests.test_estoque_vendas_dashboard_router -v
```

Expected: PASS with 5 tests.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
cd C:\Horus
git add backend\app\routers\estoque.py backend\tests\test_estoque_vendas_dashboard_router.py
git commit -m "feat(api): expõe dashboard de vendas"
```

---

### Task 3: Frontend Dashboard Tab Component

**Files:**
- Create: `frontend/src/pages/estoque/vendas/VendasDashboard.tsx`
- Test: `frontend/src/pages/estoque/__tests__/VendasDashboard.test.tsx`

- [ ] **Step 1: Write the failing dashboard component tests**

Create `frontend/src/pages/estoque/__tests__/VendasDashboard.test.tsx` with this content:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VendasDashboard } from '../vendas/VendasDashboard'

const mockDashboard = {
  periodo: {
    inicio: '2026-06-01T00:00:00+00:00',
    fim: '2026-06-30T23:59:59+00:00',
  },
  resumo: {
    qtd_vendas: 2,
    itens_vendidos: 3,
    faturamento_bruto: 3500,
    total_custo: 1800,
    lucro_bruto: 1300,
    margem_media: 37.14,
    roi_medio: 72.22,
    ticket_medio: 1750,
  },
  evolucao: [
    { periodo: '2026-06', label: 'Jun/26', faturamento_bruto: 3500, lucro_bruto: 1300 },
  ],
  produtos: [
    {
      produto_id: 'p1',
      nome: 'Asad Lattafa',
      quantidade: 2,
      faturamento_bruto: 2400,
      lucro_bruto: 920,
      margem: 38.33,
      roi: 62.16,
    },
  ],
  canais: [
    {
      canal_id: 'c1',
      nome: 'Shopee',
      qtd_vendas: 2,
      faturamento_bruto: 3500,
      lucro_bruto: 1300,
      margem: 37.14,
      roi: 72.22,
    },
  ],
  vendas: [
    {
      id: 'v1',
      numero: 10,
      data_venda: '2026-06-10',
      canal: 'Shopee',
      itens: 2,
      faturamento_bruto: 2400,
      total_custo: 1320,
      lucro_bruto: 780,
      margem: 32.5,
      roi: 59.09,
    },
  ],
}

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="vendas-chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  Legend: () => <div />,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'jwt-vendas' } },
      })),
    },
  },
}))

describe('VendasDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockDashboard),
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('busca o dashboard no backend com token e renderiza indicadores', async () => {
    render(<VendasDashboard />)

    await waitFor(() => expect(screen.getByText('Asad Lattafa')).toBeInTheDocument())

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/estoque/vendas/dashboard?'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt-vendas' },
      }),
    )
    expect(screen.getByText('Dashboard de vendas')).toBeInTheDocument()
    expect(screen.getByText('R$ 3.500,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument()
    expect(screen.getByText('37,14%')).toBeInTheDocument()
    expect(screen.getByText('72,22%')).toBeInTheDocument()
    expect(screen.getByText('2 vendas')).toBeInTheDocument()
    expect(screen.getByText('3 itens vendidos')).toBeInTheDocument()
    expect(screen.getByText('Shopee')).toBeInTheDocument()
    expect(screen.getByText('#10')).toBeInTheDocument()
    expect(screen.getByTestId('vendas-chart')).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha vendas concluidas no periodo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        periodo: mockDashboard.periodo,
        evolucao: mockDashboard.evolucao,
        resumo: {
          qtd_vendas: 0,
          itens_vendidos: 0,
          faturamento_bruto: 0,
          total_custo: 0,
          lucro_bruto: 0,
          margem_media: 0,
          roi_medio: null,
          ticket_medio: 0,
        },
        produtos: [],
        canais: [],
        vendas: [],
      }),
    })))

    render(<VendasDashboard />)

    await waitFor(() => expect(screen.getByText('Nenhuma venda concluida no periodo')).toBeInTheDocument())
  })

  it('mostra erro quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: 'Erro ao consultar vendas' }),
    })))

    render(<VendasDashboard />)

    await waitFor(() => expect(screen.getByText('Erro ao consultar vendas')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run dashboard component tests to verify RED**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/VendasDashboard.test.tsx
```

Expected: FAIL because `../vendas/VendasDashboard` does not exist.

- [ ] **Step 3: Implement `VendasDashboard.tsx`**

Create `frontend/src/pages/estoque/vendas/VendasDashboard.tsx` with this content:

```tsx
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn, formatBRL } from '@/lib/utils'
import { periodoMes, type Periodo } from '@/lib/financeiro'
import { PeriodSelector } from '@/pages/financeiro/dashboard/PeriodSelector'

interface ResumoDashboard {
  qtd_vendas: number
  itens_vendidos: number
  faturamento_bruto: number
  total_custo: number
  lucro_bruto: number
  margem_media: number
  roi_medio: number | null
  ticket_medio: number
}

interface PontoEvolucao {
  periodo: string
  label: string
  faturamento_bruto: number
  lucro_bruto: number
}

interface RankingProduto {
  produto_id: string
  nome: string
  quantidade: number
  faturamento_bruto: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface RankingCanal {
  canal_id: string | null
  nome: string
  qtd_vendas: number
  faturamento_bruto: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface VendaPeriodo {
  id: string
  numero: number
  data_venda: string
  canal: string
  itens: number
  faturamento_bruto: number
  total_custo: number
  lucro_bruto: number
  margem: number
  roi: number | null
}

interface DashboardVendasResponse {
  periodo: {
    inicio: string
    fim: string
  }
  resumo: ResumoDashboard
  evolucao: PontoEvolucao[]
  produtos: RankingProduto[]
  canais: RankingCanal[]
  vendas: VendaPeriodo[]
}

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function formatPercent(value: number | null): string {
  if (value === null) return '-'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

async function carregarDashboard(periodo: Periodo, signal: AbortSignal): Promise<DashboardVendasResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sessao expirada. Entre novamente para carregar o dashboard.')
  }

  const params = new URLSearchParams({
    inicio: periodo.inicio.toISOString(),
    fim: periodo.fim.toISOString(),
  })
  const response = await fetch(`${API_URL}/api/estoque/vendas/dashboard?${params.toString()}`, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || 'Erro ao carregar dashboard de vendas.')
  }

  return response.json()
}

function StatCard({
  label,
  icon,
  valor,
  negativo,
}: {
  label: string
  icon: string
  valor: string
  negativo?: boolean
}) {
  return (
    <div
      onMouseMove={trackMouse}
      className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{label}</span>
        <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <span className={cn('text-3xl font-light tabular-nums tracking-tight', negativo && 'text-down')}>
        {valor}
      </span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

function RankingProdutos({ produtos }: { produtos: RankingProduto[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Produtos mais lucrativos</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="text-left px-4 py-3 font-medium">Produto</th>
            <th className="text-right px-4 py-3 font-medium">Qtd</th>
            <th className="text-right px-4 py-3 font-medium">Bruto</th>
            <th className="text-right px-4 py-3 font-medium">Lucro</th>
            <th className="text-right px-4 py-3 font-medium">Margem</th>
            <th className="text-right px-4 py-3 font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {produtos.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum produto no periodo</td></tr>
          ) : produtos.map((produto) => (
            <tr key={produto.produto_id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-medium">{produto.nome}</td>
              <td className="px-4 py-3 text-right font-mono">{produto.quantidade}</td>
              <td className="px-4 py-3 text-right font-mono">{formatBRL(produto.faturamento_bruto)}</td>
              <td className={cn('px-4 py-3 text-right font-mono', produto.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                {formatBRL(produto.lucro_bruto)}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatPercent(produto.margem)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatPercent(produto.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RankingCanais({ canais }: { canais: RankingCanal[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Canais mais lucrativos</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="text-left px-4 py-3 font-medium">Canal</th>
            <th className="text-right px-4 py-3 font-medium">Vendas</th>
            <th className="text-right px-4 py-3 font-medium">Bruto</th>
            <th className="text-right px-4 py-3 font-medium">Lucro</th>
            <th className="text-right px-4 py-3 font-medium">Margem</th>
            <th className="text-right px-4 py-3 font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {canais.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum canal no periodo</td></tr>
          ) : canais.map((canal) => (
            <tr key={canal.canal_id || canal.nome} className="border-b border-line last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-medium">{canal.nome}</td>
              <td className="px-4 py-3 text-right font-mono">{canal.qtd_vendas}</td>
              <td className="px-4 py-3 text-right font-mono">{formatBRL(canal.faturamento_bruto)}</td>
              <td className={cn('px-4 py-3 text-right font-mono', canal.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                {formatBRL(canal.lucro_bruto)}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatPercent(canal.margem)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatPercent(canal.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VendasPeriodoTable({ vendas }: { vendas: VendaPeriodo[] }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
      <div className="px-4 py-3 border-b border-line bg-surface">
        <h2 className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-muted">Vendas do periodo</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="text-left px-4 py-3 font-medium">Venda</th>
            <th className="text-left px-4 py-3 font-medium">Data</th>
            <th className="text-left px-4 py-3 font-medium">Canal</th>
            <th className="text-right px-4 py-3 font-medium">Itens</th>
            <th className="text-right px-4 py-3 font-medium">Bruto</th>
            <th className="text-right px-4 py-3 font-medium">Custo</th>
            <th className="text-right px-4 py-3 font-medium">Lucro</th>
            <th className="text-right px-4 py-3 font-medium">ROI</th>
          </tr>
        </thead>
        <tbody>
          {vendas.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhuma venda concluida no periodo</td></tr>
          ) : vendas.map((venda) => (
            <tr key={venda.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-mono text-muted">#{venda.numero}</td>
              <td className="px-4 py-3 text-text-2 text-xs">{formatDate(venda.data_venda)}</td>
              <td className="px-4 py-3 font-medium">{venda.canal}</td>
              <td className="px-4 py-3 text-right font-mono">{venda.itens}</td>
              <td className="px-4 py-3 text-right font-mono">{formatBRL(venda.faturamento_bruto)}</td>
              <td className="px-4 py-3 text-right font-mono text-text-2">{formatBRL(venda.total_custo)}</td>
              <td className={cn('px-4 py-3 text-right font-mono', venda.lucro_bruto < 0 ? 'text-down' : 'text-up')}>
                {formatBRL(venda.lucro_bruto)}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatPercent(venda.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VendasDashboard() {
  const hoje = new Date()
  const [periodo, setPeriodo] = useState<Periodo>(periodoMes(hoje.getFullYear(), hoje.getMonth()))
  const [dashboard, setDashboard] = useState<DashboardVendasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setErro(null)
    carregarDashboard(periodo, controller.signal)
      .then(setDashboard)
      .catch((err) => {
        if (err.name !== 'AbortError') setErro(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [periodo])

  const resumo = dashboard?.resumo
  const cardValor = (value: string) => (loading ? '-' : value)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">Dashboard de vendas</h2>
          <p className="text-muted text-sm mt-1">Faturamento, lucro, margem e ROI calculados no backend</p>
        </div>
      </div>

      <PeriodSelector value={periodo} onChange={setPeriodo} />

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Faturamento bruto" icon="cart" valor={cardValor(formatBRL(resumo?.faturamento_bruto ?? 0))} />
        <StatCard
          label="Lucro bruto"
          icon="goal"
          valor={cardValor(formatBRL(resumo?.lucro_bruto ?? 0))}
          negativo={!loading && (resumo?.lucro_bruto ?? 0) < 0}
        />
        <StatCard label="Margem media" icon="dashboard" valor={cardValor(formatPercent(resumo?.margem_media ?? 0))} />
        <StatCard label="ROI medio" icon="up" valor={cardValor(formatPercent(resumo?.roi_medio ?? null))} />
      </div>

      {resumo && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 rounded-xl border border-line bg-surface text-sm">
          <span><span className="text-muted">Ticket medio:</span> <span className="font-mono">{formatBRL(resumo.ticket_medio)}</span></span>
          <span><span className="text-muted">Volume:</span> <span className="font-mono">{resumo.qtd_vendas} vendas</span></span>
          <span><span className="text-muted">Itens:</span> <span className="font-mono">{resumo.itens_vendidos} itens vendidos</span></span>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-10 text-center text-muted border border-line rounded-xl bg-surface/40">Carregando</div>
      ) : dashboard && (
        <>
          {dashboard.resumo.qtd_vendas === 0 && (
            <div className="px-4 py-4 rounded-xl border border-line bg-surface text-muted text-sm">
              Nenhuma venda concluida no periodo
            </div>
          )}

          <div className="border border-line rounded-xl p-5 bg-surface">
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[.16em] text-muted mb-4">
              Evolucao de vendas
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dashboard.evolucao} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={56} />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value))}
                  contentStyle={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-line)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="faturamento_bruto" name="Faturamento" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lucro_bruto" name="Lucro" stroke="var(--color-up)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
            <RankingProdutos produtos={dashboard.produtos} />
            <RankingCanais canais={dashboard.canais} />
          </div>

          <VendasPeriodoTable vendas={dashboard.vendas} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run dashboard component tests to verify GREEN**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/VendasDashboard.test.tsx
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
cd C:\Horus
git add frontend\src\pages\estoque\vendas\VendasDashboard.tsx frontend\src\pages\estoque\__tests__\VendasDashboard.test.tsx
git commit -m "feat(frontend): adiciona dashboard de vendas"
```

---

### Task 4: Tabs Inside Vendas Page

**Files:**
- Modify: `frontend/src/pages/estoque/Vendas.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`

- [ ] **Step 1: Write the failing tab integration test**

Modify `frontend/src/pages/estoque/__tests__/Vendas.test.tsx`:

1. Add this mock below the `Modal` mock:

```tsx
vi.mock('../vendas/VendasDashboard', () => ({
  VendasDashboard: () => <div>Dashboard analitico de vendas</div>,
}))
```

2. Add this test inside the existing `describe('EstVendas (lista)', () => { })` block:

```tsx
it('alterna entre lista e dashboard sem sair da tela de vendas', async () => {
  render(<MemoryRouter><EstVendas /></MemoryRouter>)

  expect(screen.getByRole('button', { name: /^lista$/i })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: /^dashboard$/i }))

  expect(screen.getByText('Dashboard analitico de vendas')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^dashboard$/i })).toHaveAttribute('aria-pressed', 'true')
})
```

3. Update the first import line to include `fireEvent`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
```

- [ ] **Step 2: Run Vendas tests to verify RED**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/Vendas.test.tsx
```

Expected: FAIL because the `Dashboard` tab does not exist.

- [ ] **Step 3: Add tabs to `Vendas.tsx`**

Modify `frontend/src/pages/estoque/Vendas.tsx` with these exact changes.

Update imports:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { Modal } from '@/components/shared/Modal'
import { cn, formatBRL } from '@/lib/utils'
import { NovaVendaModal } from './vendas/NovaVendaModal'
import { VendaDetalheModal } from './vendas/VendaDetalheModal'
import { VendasDashboard } from './vendas/VendasDashboard'
```

Add this type after `STATUS_BADGE`:

```tsx
type AbaVendas = 'lista' | 'dashboard'
```

Add this helper before `export function EstVendas()`:

```tsx
function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
        active ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
      )}
    >
      {children}
    </button>
  )
}
```

Add this state inside `EstVendas`, after the `erro` state:

```tsx
const [aba, setAba] = useState<AbaVendas>('lista')
```

Replace the current top action block:

```tsx
<div className="flex items-center gap-2">
  <Button variant="secondary" onClick={() => navigate('/estoque/vendas/config')}>
    <Icon name="filter" size={16} />
    Canais e embalagens
  </Button>
  <Button onClick={() => setNovoOpen(true)}>
    <Icon name="plus" size={16} />
    Nova venda
  </Button>
</div>
```

with:

```tsx
{aba === 'lista' && (
  <div className="flex items-center gap-2">
    <Button variant="secondary" onClick={() => navigate('/estoque/vendas/config')}>
      <Icon name="filter" size={16} />
      Canais e embalagens
    </Button>
    <Button onClick={() => setNovoOpen(true)}>
      <Icon name="plus" size={16} />
      Nova venda
    </Button>
  </div>
)}
```

Add this tab control immediately after the header block:

```tsx
<div className="inline-flex self-start items-center gap-1 p-0.5 border border-line-2 rounded-xl bg-surface-2">
  <TabButton active={aba === 'lista'} onClick={() => setAba('lista')}>
    Lista
  </TabButton>
  <TabButton active={aba === 'dashboard'} onClick={() => setAba('dashboard')}>
    Dashboard
  </TabButton>
</div>
```

Wrap the existing error alert, sales table, `NovaVendaModal`, `VendaDetalheModal`, and cancel modal in this conditional:

```tsx
{aba === 'dashboard' ? (
  <VendasDashboard />
) : (
  <>
    {erro && (
      <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
    )}

    <div className="border border-line rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface">
            <th className="text-left px-4 py-3 text-text-2 font-medium">Nº</th>
            <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
            <th className="text-left px-4 py-3 text-text-2 font-medium">Canal</th>
            <th className="text-right px-4 py-3 text-text-2 font-medium">Itens</th>
            <th className="text-right px-4 py-3 text-text-2 font-medium">Bruto</th>
            <th className="text-right px-4 py-3 text-text-2 font-medium">Lucro</th>
            <th className="text-right px-4 py-3 text-text-2 font-medium">ROI</th>
            <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Carregando</td></tr>
          ) : vendas.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Nenhuma venda registrada</td></tr>
          ) : (
            vendas.map((v) => {
              const badge = STATUS_BADGE[v.status]
              const roiV = v.total_custo > 0 ? v.lucro_bruto / v.total_custo : null
              return (
                <tr
                  key={v.id}
                  className="border-b border-line last:border-0 hover:bg-surface-2/50 cursor-pointer"
                  onClick={() => setDetalhe(v)}
                >
                  <td className="px-4 py-3 font-mono text-muted">#{v.numero}</td>
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(v.data_venda)}</td>
                  <td className="px-4 py-3 font-medium">{v.canais?.nome || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{v.venda_itens.length}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBRL(v.total_bruto)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${v.lucro_bruto < 0 ? 'text-down' : 'text-up'}`}>
                    {formatBRL(v.lucro_bruto)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text-2">{pct(roiV)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {v.status === 'concluida' && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelando(v)}>
                        Cancelar
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>

    <NovaVendaModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={fetchData} />
    <VendaDetalheModal venda={detalhe} onClose={() => setDetalhe(null)} />

    <Modal open={!!cancelando} onClose={() => setCancelando(null)} title="Cancelar venda" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-2">
          Cancelar a venda <span className="font-mono">#{cancelando?.numero}</span>? O estoque e devolvido,
          os decants sao estornados e os lancamentos no caixa sao removidos. A venda nao pode ser reaberta.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setCancelando(null)}>Voltar</Button>
          <Button variant="danger" disabled={cancelSubmitting} onClick={confirmarCancelamento}>
            {cancelSubmitting ? 'Cancelando' : 'Cancelar venda'}
          </Button>
        </div>
      </div>
    </Modal>
  </>
)}
```

Keep the existing `formatDate`, `confirmarCancelamento`, `fetchData`, `STATUS_BADGE`, `pct`, and `VendaRow` logic unchanged except for the wrapping described above.

- [ ] **Step 4: Run Vendas tests to verify GREEN**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/Vendas.test.tsx
```

Expected: PASS with existing list tests and the new tab test.

- [ ] **Step 5: Run frontend focused tests**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/VendasDashboard.test.tsx src/pages/estoque/__tests__/Vendas.test.tsx
```

Expected: PASS for both files.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
cd C:\Horus
git add frontend\src\pages\estoque\Vendas.tsx frontend\src\pages\estoque\__tests__\Vendas.test.tsx
git commit -m "feat(frontend): adiciona abas em vendas"
```

---

### Task 5: Full Verification and Documentation

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Run complete backend tests**

Run:

```bash
cd C:\Horus\backend
python -m unittest discover -s tests -v
```

Expected: PASS for all backend tests.

- [ ] **Step 2: Run complete frontend tests**

Run:

```bash
cd C:\Horus\frontend
npm run test:run
```

Expected: PASS for all frontend tests.

- [ ] **Step 3: Run frontend production build**

Run:

```bash
cd C:\Horus\frontend
npm run build
```

Expected: PASS. Vite chunk-size warnings are acceptable if build exits with code 0.

- [ ] **Step 4: Check whitespace**

Run:

```bash
cd C:\Horus
git diff --check
```

Expected: no whitespace errors. CRLF warnings are acceptable on Windows.

- [ ] **Step 5: Update `docs/HANDOFF_IA.md`**

Add a new numbered entry under "O que ja foi feito":

```markdown
32. **Dashboard de vendas e ROI (Sessao 26)**
    - `/estoque/vendas` ganhou abas `Lista` e `Dashboard`
    - `GET /api/estoque/vendas/dashboard` calcula faturamento, lucro, margem, ROI, ticket medio, evolucao mensal, rankings de produtos/canais e tabela de vendas do periodo
    - Calculo roda no backend FastAPI com `Decimal` e ignora vendas canceladas
    - Frontend consome o endpoint com JWT Supabase e seletor de periodo igual ao financeiro
    - Sem migracao de banco; usa `vendas`, `venda_itens`, `canais` e `produtos`
```

Update "Estado atual" test counts after the real verification output.

- [ ] **Step 6: Update `docs/LOGS.md`**

Add a new top entry:

```markdown
## 2026-06-23 - Sessao 26: Dashboard de vendas e ROI

- Criado endpoint protegido `GET /api/estoque/vendas/dashboard`.
- Adicionado service backend `vendas_dashboard.py` com calculo em `Decimal`.
- Adicionada aba `Dashboard` dentro de `/estoque/vendas`, mantendo a aba `Lista` com o fluxo operacional.
- Dashboard exibe cards de faturamento, lucro, margem e ROI, linha auxiliar de ticket/volume, grafico mensal, ranking de produtos, ranking de canais e tabela de vendas do periodo.
- Vendas canceladas ficam fora de todos os indicadores.

### Validacao

- RED/GREEN backend: `python -m unittest tests.test_vendas_dashboard tests.test_estoque_vendas_dashboard_router -v`
- RED/GREEN frontend: `npm run test:run -- src/pages/estoque/__tests__/VendasDashboard.test.tsx src/pages/estoque/__tests__/Vendas.test.tsx`
- Suite backend completa: `python -m unittest discover -s tests -v`
- Suite frontend completa: `npm run test:run`
- Build frontend: `npm run build`
- Whitespace: `git diff --check`
```

Replace the validation bullet outcomes with actual pass counts from the commands.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
cd C:\Horus
git add docs\HANDOFF_IA.md docs\LOGS.md
git commit -m "docs: atualiza handoff do dashboard de vendas"
```

- [ ] **Step 8: Final status check**

Run:

```bash
cd C:\Horus
git status --short
```

Expected: clean working tree.

---

## Final Verification Checklist

- Backend service tests prove summary, products, channels, monthly evolution, canceled-sale exclusion, and zero-cost ROI behavior.
- Backend router tests prove invalid periods return `400` and the endpoint queries the expected Supabase tables.
- Frontend dashboard tests prove authenticated fetch, KPI rendering, rankings/table rendering, empty state, and API error state.
- Vendas page tests prove the existing sales list still renders and the new tab switch works.
- Full backend suite passes.
- Full frontend suite passes.
- Frontend production build passes.
- Documentation is updated.
