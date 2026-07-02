import sys
import types
import unittest

from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.main import app


class PublicPlaceholderAuthTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_financeiro_placeholder_endpoints_exigem_autenticacao(self):
        for path in ["/api/financeiro/transacoes", "/api/financeiro/contas"]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertIn(response.status_code, (401, 403))

    def test_estoque_placeholder_endpoints_exigem_autenticacao(self):
        paths = [
            "/api/estoque/produtos",
            "/api/estoque/movimentacoes",
            "/api/estoque/categorias",
            "/api/estoque/fornecedores",
            "/api/estoque/alertas",
        ]
        for path in paths:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertIn(response.status_code, (401, 403))


if __name__ == "__main__":
    unittest.main()