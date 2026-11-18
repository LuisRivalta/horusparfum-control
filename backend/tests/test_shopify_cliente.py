# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162018-6f26
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: test_shopify_cliente.py
# Assunto            : Testes do cliente Shopify
# Origem             : solicitacao do usuario
# Motivo             : TDD do cliente Shopify pedido pelo Luis
# Criado em          : 2026-11-18 16:19:48
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import base64
import hashlib
import hmac
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs

import httpx

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.config import settings
from app.services.shopify.cliente import ShopifyCliente, ShopifyDesconectado, ShopifyErro, verificar_hmac


class FakeQuery:
    def __init__(self, db):
        self.db = db
        self.op = None
        self.payload = None

    def select(self, columns):
        self.op = "select"
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def eq(self, field, value):
        return self

    def execute(self):
        if self.op == "select":
            return SimpleNamespace(data=[dict(self.db.row)] if self.db.row else [])
        self.db.row.update(self.payload)
        return SimpleNamespace(data=[dict(self.db.row)])


class FakeDb:
    def __init__(self, row=None):
        self.row = row

    def table(self, name):
        assert name == "shopify_conexao"
        return FakeQuery(self)


def iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


def linha(delta=timedelta(hours=1), token="TOK"):
    return {"id": 1, "access_token": token, "expires_at": iso(delta), "location_id": "gid://shopify/Location/1",
            "conectado_em": iso(timedelta(days=-1))}


def cliente(handler, db):
    return ShopifyCliente(http=httpx.Client(transport=httpx.MockTransport(handler)), db=db)


class ShopifyClienteTest(unittest.TestCase):
    def setUp(self):
        p = patch.multiple(settings, shopify_loja="loja.myshopify.com", shopify_client_id="CID",
                           shopify_client_secret="SEGREDO")
        p.start()
        self.addCleanup(p.stop)

    def test_hmac_valido(self):
        corpo = b'{"id": 1}'
        sig = base64.b64encode(hmac.new(b"SEGREDO", corpo, hashlib.sha256).digest()).decode()
        self.assertTrue(verificar_hmac(corpo, sig))

    def test_hmac_invalido(self):
        self.assertFalse(verificar_hmac(b"{}", "lixo"))
        self.assertFalse(verificar_hmac(b"{}", None))

    def test_hmac_sem_segredo_recusa(self):
        corpo = b"{}"
        sig = base64.b64encode(hmac.new(b"", corpo, hashlib.sha256).digest()).decode()
        with patch.object(settings, "shopify_client_secret", ""):
            self.assertFalse(verificar_hmac(corpo, sig))

    def test_renova_token_vencido(self):
        chamadas = []

        def handler(req):
            chamadas.append(req.url.path)
            if req.url.path == "/admin/oauth/access_token":
                form = parse_qs(req.content.decode())
                self.assertEqual(form["grant_type"], ["client_credentials"])
                self.assertEqual(form["client_id"], ["CID"])
                return httpx.Response(200, json={"access_token": "NOVO", "expires_in": 86399})
            self.assertEqual(req.headers["X-Shopify-Access-Token"], "NOVO")
            return httpx.Response(200, json={"data": {"shop": {"name": "x"}}})

        db = FakeDb(linha(timedelta(minutes=1), "VELHO"))
        self.assertEqual(cliente(handler, db).graphql("{ shop { name } }"), {"shop": {"name": "x"}})
        self.assertEqual(db.row["access_token"], "NOVO")
        self.assertEqual(chamadas[0], "/admin/oauth/access_token")
        self.assertTrue(chamadas[1].endswith("/graphql.json"))

    def test_usa_token_valido_sem_renovar(self):
        def handler(req):
            self.assertNotEqual(req.url.path, "/admin/oauth/access_token")
            self.assertEqual(req.headers["X-Shopify-Access-Token"], "TOK")
            return httpx.Response(200, json={"data": {"ok": True}})

        self.assertEqual(cliente(handler, FakeDb(linha())).graphql("{ a }"), {"ok": True})

    def test_user_errors_vira_shopify_erro(self):
        corpo = {"data": {"productUpdate": {"userErrors": [{"message": "A"}, {"message": "B"}]}}}
        c = cliente(lambda r: httpx.Response(200, json=corpo), FakeDb(linha()))
        with self.assertRaises(ShopifyErro) as ctx:
            c.graphql("mutation { x }")
        self.assertEqual(ctx.exception.mensagem, "A; B")

    def test_errors_e_http_viram_shopify_erro(self):
        c = cliente(lambda r: httpx.Response(200, json={"errors": [{"message": "ruim"}]}), FakeDb(linha()))
        with self.assertRaises(ShopifyErro):
            c.graphql("{ a }")
        c = cliente(lambda r: httpx.Response(500), FakeDb(linha()))
        with self.assertRaises(ShopifyErro):
            c.graphql("{ a }")

    def test_sem_conexao_desconectado(self):
        c = cliente(lambda r: httpx.Response(500), FakeDb())
        with self.assertRaises(ShopifyDesconectado):
            c.graphql("{ a }")

    def test_location_id(self):
        self.assertEqual(cliente(lambda r: httpx.Response(500), FakeDb(linha())).location_id,
                         "gid://shopify/Location/1")


if __name__ == "__main__":
    unittest.main()
