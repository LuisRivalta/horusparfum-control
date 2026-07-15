import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth.deps import get_current_user
from app.main import app


class FakeQuery:
    def __init__(self, table_name, owner):
        self.table_name = table_name
        self.owner = owner
        self.start = 0
        self.end = 999

    def select(self, columns):
        self.owner.calls.append((self.table_name, "select", columns))
        return self

    def order(self, column, desc=False):
        self.owner.calls.append((self.table_name, "order", column, desc))
        return self

    def range(self, start, end):
        self.start = start
        self.end = end
        self.owner.calls.append((self.table_name, "range", start, end))
        return self

    def execute(self):
        self.owner.calls.append((self.table_name, "execute"))
        if self.owner.fail_table == self.table_name:
            raise RuntimeError(f"falha em {self.table_name}")
        rows = self.owner.rows[self.table_name]
        return SimpleNamespace(data=rows[self.start:self.end + 1])


class FakeSupabase:
    def __init__(self, rows, fail_table=None):
        self.rows = rows
        self.fail_table = fail_table
        self.calls = []

    def table(self, table_name):
        self.calls.append((table_name, "table"))
        return FakeQuery(table_name, self)


def transacao(index):
    return {
        "id": f"t-{index:04d}",
        "descricao": f"Entrada {index}",
        "tipo": "entrada",
        "valor": "1.00",
        "categoria": "Vendas",
        "forma_pagamento": "Pix",
        "responsavel": "Luis",
        "origem": "manual",
        "venda_id": None,
        "created_at": "2026-07-10T12:00:00+00:00",
    }


def venda(index):
    return {
        "id": f"v-{index:04d}",
        "data_venda": "2026-07-10",
        "status": "cancelada",
        "total_custo": "999.00",
    }


class RelatorioFinanceiroRouterTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.previous_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1"}

    def tearDown(self):
        app.dependency_overrides = self.previous_overrides

    def test_pagina_transacoes_e_vendas_com_ordem_deterministica(self):
        fake = FakeSupabase({
            "transacoes": [transacao(i) for i in range(1001)],
            "vendas": [venda(i) for i in range(1001)],
        })

        with patch("app.routers.financeiro.get_supabase", return_value=fake):
            response = self.client.get(
                "/api/financeiro/relatorios",
                params={"inicio": "2026-07-01T00:00:00-03:00", "fim": "2026-07-31T23:59:59-03:00"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resumo"]["receita"], 1001.0)
        self.assertIn(("transacoes", "select", "id, descricao, tipo, valor, categoria, forma_pagamento, responsavel, origem, venda_id, created_at"), fake.calls)
        self.assertIn(("vendas", "select", "id, data_venda, status, total_custo"), fake.calls)
        for table_name in ("transacoes", "vendas"):
            self.assertEqual(
                [call for call in fake.calls if call[:2] == (table_name, "order")],
                [(table_name, "order", "id", False), (table_name, "order", "id", False)],
            )
            self.assertEqual(
                [call for call in fake.calls if call[:2] == (table_name, "range")],
                [(table_name, "range", 0, 999), (table_name, "range", 1000, 1999)],
            )

    def test_retorna_502_claro_quando_qualquer_consulta_falha(self):
        for table_name in ("transacoes", "vendas"):
            with self.subTest(table_name=table_name):
                fake = FakeSupabase({"transacoes": [], "vendas": []}, fail_table=table_name)
                with patch("app.routers.financeiro.get_supabase", return_value=fake):
                    response = self.client.get(
                        "/api/financeiro/relatorios",
                        params={"inicio": "2026-07-01T00:00:00-03:00", "fim": "2026-07-31T23:59:59-03:00"},
                    )

                self.assertEqual(response.status_code, 502)
                self.assertEqual(
                    response.json(),
                    {"detail": f"Erro ao consultar {table_name}: falha em {table_name}"},
                )


if __name__ == "__main__":
    unittest.main()