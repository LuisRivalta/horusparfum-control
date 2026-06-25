import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.routers.estoque import vendas_dashboard


class FakeQuery:
    def __init__(self, table_name, calls, vendas_data=None):
        self.table_name = table_name
        self.calls = calls
        self.filters = []
        self.vendas_data = vendas_data

    def select(self, columns):
        self.calls.append((self.table_name, "select", columns))
        return self

    def gte(self, field, value):
        self.filters.append(("gte", field, value))
        return self

    def lte(self, field, value):
        self.filters.append(("lte", field, value))
        return self

    def in_(self, field, values):
        self.filters.append(("in", field, list(values)))
        return self

    def execute(self):
        self.calls.append((self.table_name, "execute", list(self.filters)))
        if self.table_name == "vendas":
            return SimpleNamespace(data=self.vendas_data if self.vendas_data is not None else [
                {
                    "id": "v1",
                    "numero": 10,
                    "status": "concluida",
                    "data_venda": "2026-06-10",
                    "total_bruto": "100.00",
                    "total_custo": "60.00",
                    "lucro_bruto": "40.00",
                    "taxa_total": "0.00",
                    "frete": "0.00",
                    "canal_id": "c1",
                    "created_at": "2026-06-10T12:00:00+00:00",
                },
                {
                    "id": "v2",
                    "numero": 11,
                    "status": "concluida",
                    "data_venda": "2026-06-11",
                    "total_bruto": "160.00",
                    "total_custo": "70.00",
                    "lucro_bruto": "90.00",
                    "taxa_total": "0.00",
                    "frete": "0.00",
                    "canal_id": "c2",
                    "created_at": "2026-06-11T12:00:00+00:00",
                },
            ])

        if self.table_name == "venda_itens":
            venda_ids = []
            for op, field, values in self.filters:
                if op == "in" and field == "venda_id":
                    venda_ids = values
            items = [
                {
                    "id": "i1",
                    "venda_id": "v1",
                    "produto_id": "p1",
                    "quantidade": 1,
                    "preco_unitario": "100.00",
                    "custo_unitario": "60.00",
                    "custo_embalagem": "0.00",
                    "lucro": "40.00",
                },
                {
                    "id": "i2",
                    "venda_id": "v2",
                    "produto_id": "p2",
                    "quantidade": 2,
                    "preco_unitario": "80.00",
                    "custo_unitario": "30.00",
                    "custo_embalagem": "5.00",
                    "lucro": "15.00",
                },
            ]
            return SimpleNamespace(data=[item for item in items if item["venda_id"] in venda_ids])

        if self.table_name == "canais":
            return SimpleNamespace(data=[{"id": "c1", "nome": "Shopee"}, {"id": "c2", "nome": "Loja fisica"}])

        if self.table_name == "produtos":
            return SimpleNamespace(data=[{"id": "p1", "nome": "Produto 1"}, {"id": "p2", "nome": "Produto 2"}])

        return SimpleNamespace(data=[])


class FakeSupabase:
    def __init__(self, vendas_data=None):
        self.calls = []
        self.vendas_data = vendas_data

    def table(self, table_name):
        self.calls.append(("table", table_name))
        return FakeQuery(table_name, self.calls, self.vendas_data if table_name == "vendas" else None)


class EstoqueVendasDashboardRouterTest(unittest.TestCase):
    def test_rejeita_periodo_invalido_quando_inicio_for_maior_que_fim(self):
        with self.assertRaises(HTTPException) as raised:
            vendas_dashboard(
                inicio="2026-06-30T00:00:00Z",
                fim="2026-06-01T00:00:00Z",
                _user={"sub": "user-1"},
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "Inicio deve ser menor ou igual ao fim")

    def test_consulta_supabase_e_retorna_painel_de_vendas(self):
        fake_supabase = FakeSupabase()

        with patch("app.routers.estoque.get_supabase", return_value=fake_supabase):
            payload = vendas_dashboard(
                inicio="2026-06-01T00:00:00Z",
                fim="2026-06-30T23:59:59Z",
                _user={"sub": "user-1"},
            )

        self.assertEqual([call for call in fake_supabase.calls if call[0] == "table"], [
            ("table", "vendas"),
            ("table", "venda_itens"),
            ("table", "canais"),
            ("table", "produtos"),
        ])
        self.assertIn(("in", "venda_id", ["v1", "v2"]), [call[2][0] for call in fake_supabase.calls if call[0] == "venda_itens" and call[1] == "execute"])
        self.assertEqual(payload["resumo"]["qtd_vendas"], 2)
        self.assertEqual(payload["resumo"]["faturamento_bruto"], 260.0)
        self.assertEqual(payload["vendas"][0]["numero"], 11)
        self.assertEqual(payload["canais"][0]["nome"], "Loja fisica")
        self.assertEqual(payload["produtos"][0]["nome"], "Produto 1")

    def test_sem_vendas_nao_consulta_venda_itens_e_retorna_dashboard_vazio(self):
        fake_supabase = FakeSupabase(vendas_data=[])

        with patch("app.routers.estoque.get_supabase", return_value=fake_supabase):
            payload = vendas_dashboard(
                inicio="2026-06-01T00:00:00Z",
                fim="2026-06-30T23:59:59Z",
                _user={"sub": "user-1"},
            )

        self.assertEqual([call for call in fake_supabase.calls if call[0] == "table"], [
            ("table", "vendas"),
            ("table", "canais"),
            ("table", "produtos"),
        ])
        self.assertNotIn(("table", "venda_itens"), fake_supabase.calls)
        self.assertEqual(payload["resumo"]["qtd_vendas"], 0)
        self.assertEqual(payload["resumo"]["faturamento_bruto"], 0.0)
        self.assertEqual(payload["vendas"], [])
        self.assertEqual(payload["produtos"], [])
        self.assertEqual(payload["canais"], [])


if __name__ == "__main__":
    unittest.main()