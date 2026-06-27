import sys
import types
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import get_current_user
from app.main import app
from app.services.pedido_pdf_import import PedidoPdfParseError


class EstoquePedidoPdfRouterTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.previous_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1", "email": "user@example.com"}

    def tearDown(self):
        app.dependency_overrides = self.previous_overrides

    def test_rejeita_arquivo_nao_pdf(self):
        response = self.client.post(
            "/api/estoque/pedidos/importar-pdf",
            files={"file": ("pedido.txt", b"abc", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Envie um arquivo PDF"})

    def test_retorna_itens_extraidos(self):
        payload = {
            "itens": [{"nome": "Perfume X", "codigo": "DB-X1", "qtd": 2.0, "preco_unitario": 10.5, "total": 21.0}],
            "avisos": [],
        }

        with patch("app.routers.estoque.parse_pedido_pdf_bytes", return_value=payload) as parser:
            response = self.client.post(
                "/api/estoque/pedidos/importar-pdf",
                files={"file": ("pedido.pdf", b"%PDF fake", "application/pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        parser.assert_called_once_with(b"%PDF fake")

    def test_retorna_erro_limpo_do_parser(self):
        with patch(
            "app.routers.estoque.parse_pedido_pdf_bytes",
            side_effect=PedidoPdfParseError("PDF sem texto extraível"),
        ):
            response = self.client.post(
                "/api/estoque/pedidos/importar-pdf",
                files={"file": ("pedido.pdf", b"%PDF fake", "application/pdf")},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "PDF sem texto extraível"})


if __name__ == "__main__":
    unittest.main()
