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
