# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-162847-7a93
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Anuncios: test_mercadolivre_conexao.py
# Assunto            : Modulo/teste do backend do modulo Anuncios (Mercado Livre) do Horus Parfum Control
# Origem             : solicitacao do usuario
# Motivo             : Implementar a Parte 2 do plano de Anuncios pedida pelo Luis
# Criado em          : 2026-11-16 14:50:34
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import json
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs

import httpx
from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import get_current_user
from app.config import settings
from app.main import app
from app.services.mercadolivre import MLCliente, MLDesconectado
from app.services.mercadolivre.conexao import assinar_state, trocar_codigo, validar_state


class FakeQuery:
    def __init__(self, db):
        self.db = db
        self.op = None
        self.payload = None
        self.filters = []

    def select(self, columns):
        self.op = "select"
        return self

    def upsert(self, payload):
        self.op, self.payload = "upsert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def _casa(self, row):
        return row is not None and all(row.get(f) == v for f, v in self.filters)

    def execute(self):
        db = self.db
        if self.op == "select":
            return SimpleNamespace(data=[dict(db.row)] if self._casa(db.row) else [])
        if self.op == "upsert":
            db.row = {**(db.row or {}), **self.payload}
            return SimpleNamespace(data=[dict(db.row)])
        if self.op == "update":
            if db.antes_do_update:
                db.antes_do_update()
                db.antes_do_update = None
            if not self._casa(db.row):
                return SimpleNamespace(data=[])
            db.row.update(self.payload)
            return SimpleNamespace(data=[dict(db.row)])
        if self.op == "delete":
            if self._casa(db.row):
                db.row = None
            return SimpleNamespace(data=[])
        raise AssertionError(self.op)


class FakeDb:
    def __init__(self, row=None):
        self.row = row
        self.antes_do_update = None

    def table(self, name):
        assert name == "ml_conexao"
        return FakeQuery(self)


def iso(delta):
    return (datetime.now(timezone.utc) + delta).isoformat()


class MercadoLivreConexaoTest(unittest.TestCase):
    def setUp(self):
        p = patch.multiple(
            settings,
            ml_client_id="CID",
            ml_client_secret="SEGREDO",
            ml_redirect_uri="https://api.exemplo/api/mercadolivre/callback",
            frontend_url="https://app.exemplo",
        )
        p.start()
        self.addCleanup(p.stop)

    def test_state_valido_e_expirado(self):
        state = assinar_state("u1", 1000)
        self.assertTrue(validar_state(state, 1000 + 599))
        self.assertFalse(validar_state(state, 1000 + 601))
        self.assertFalse(validar_state(state[:-1] + ("0" if state[-1] != "0" else "1"), 1000))
        self.assertFalse(validar_state(state.replace("u1", "u2"), 1000))
        self.assertFalse(validar_state("lixo", 1000))

    def test_trocar_codigo_salva_tokens_e_user_product(self):
        def handler(req):
            if req.url.path == "/oauth/token":
                form = parse_qs(req.content.decode())
                self.assertEqual(form["grant_type"], ["authorization_code"])
                self.assertEqual(form["code"], ["COD"])
                return httpx.Response(200, json={"access_token": "A", "refresh_token": "R", "expires_in": 21600})
            if req.url.path == "/users/me":
                self.assertEqual(req.headers["Authorization"], "Bearer A")
                return httpx.Response(200, json={"id": 123, "nickname": "HORUS", "tags": ["user_product_seller"]})
            return httpx.Response(404)

        db = FakeDb()
        resultado = trocar_codigo("COD", httpx.Client(transport=httpx.MockTransport(handler)), db=db)

        self.assertEqual(db.row["access_token"], "A")
        self.assertEqual(db.row["refresh_token"], "R")
        self.assertIs(db.row["user_product"], True)
        self.assertEqual(db.row["ml_user_id"], 123)
        self.assertEqual(db.row["nickname"], "HORUS")
        self.assertNotIn("access_token", resultado)
        self.assertNotIn("refresh_token", resultado)

    def test_cliente_renova_token_vencido(self):
        chamadas = []

        def handler(req):
            chamadas.append((req.method, req.url.path))
            if req.url.path == "/oauth/token":
                form = parse_qs(req.content.decode())
                self.assertEqual(form["grant_type"], ["refresh_token"])
                self.assertEqual(form["refresh_token"], ["VELHO"])
                return httpx.Response(200, json={"access_token": "NOVO", "refresh_token": "R2", "expires_in": 21600})
            self.assertEqual(req.headers["Authorization"], "Bearer NOVO")
            return httpx.Response(200, json={"ok": True})

        db = FakeDb({"id": 1, "ml_user_id": 9, "access_token": "ANTIGO", "refresh_token": "VELHO",
                     "expires_at": iso(timedelta(hours=-1)), "user_product": False})
        cliente = MLCliente(http=httpx.Client(transport=httpx.MockTransport(handler)), db=db)

        self.assertEqual(cliente.get("/x"), {"ok": True})
        self.assertEqual(chamadas, [("POST", "/oauth/token"), ("GET", "/x")])
        self.assertEqual(db.row["refresh_token"], "R2")
        self.assertEqual(db.row["access_token"], "NOVO")

    def test_renovacao_concorrente_usa_token_salvo(self):
        def handler(req):
            if req.url.path == "/oauth/token":
                return httpx.Response(200, json={"access_token": "MEU", "refresh_token": "R_MEU", "expires_in": 21600})
            self.assertEqual(req.headers["Authorization"], "Bearer DO_OUTRO")
            return httpx.Response(200, json={"ok": True})

        db = FakeDb({"id": 1, "ml_user_id": 9, "access_token": "ANTIGO", "refresh_token": "VELHO",
                     "expires_at": iso(timedelta(minutes=1)), "user_product": True})

        def outro_processo():
            db.row.update({"access_token": "DO_OUTRO", "refresh_token": "R_OUTRO",
                           "expires_at": iso(timedelta(hours=6))})

        db.antes_do_update = outro_processo
        cliente = MLCliente(http=httpx.Client(transport=httpx.MockTransport(handler)), db=db)

        self.assertEqual(cliente.get("/x"), {"ok": True})
        self.assertEqual(db.row["refresh_token"], "R_OUTRO")
        self.assertTrue(cliente.user_product)
        self.assertEqual(cliente.ml_user_id, 9)

    def test_refresh_invalido_lanca_desconectado(self):
        def handler(req):
            return httpx.Response(400, json={"error": "invalid_grant", "message": "invalid_grant", "status": 400})

        db = FakeDb({"id": 1, "access_token": "A", "refresh_token": "VELHO",
                     "expires_at": iso(timedelta(hours=-1))})
        cliente = MLCliente(http=httpx.Client(transport=httpx.MockTransport(handler)), db=db)
        with self.assertRaises(MLDesconectado):
            cliente.get("/x")

    def test_sem_conexao_lanca_desconectado(self):
        cliente = MLCliente(http=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))), db=FakeDb())
        with self.assertRaises(MLDesconectado):
            cliente.get("/x")

    def test_erro_ml_usa_mensagem_da_causa(self):
        from app.services.mercadolivre import MLErro

        def handler(req):
            return httpx.Response(400, json={"message": "Validation error", "error": "validation_error",
                                             "status": 400, "cause": [{"message": "title is required"}]})

        db = FakeDb({"id": 1, "access_token": "A", "refresh_token": "R", "expires_at": iso(timedelta(hours=5))})
        cliente = MLCliente(http=httpx.Client(transport=httpx.MockTransport(handler)), db=db)
        with self.assertRaises(MLErro) as ctx:
            cliente.post("/items", {"title": ""})
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn("title is required", ctx.exception.mensagem)


class MercadoLivreRotasTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, follow_redirects=False)
        self.previous_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1", "email": "user@example.com"}
        p = patch.multiple(settings, ml_client_id="CID", ml_client_secret="SEGREDO",
                           ml_redirect_uri="https://api.exemplo/cb", frontend_url="https://app.exemplo")
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        app.dependency_overrides = self.previous_overrides

    def test_rota_conexao_nao_expoe_tokens(self):
        db = FakeDb({"id": 1, "nickname": "HORUS", "user_product": True, "access_token": "A",
                     "refresh_token": "R", "expires_at": iso(timedelta(hours=5))})
        with patch("app.routers.mercadolivre.get_supabase", return_value=db):
            response = self.client.get("/api/mercadolivre/conexao")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload, {"conectado": True, "nickname": "HORUS", "user_product": True})
        self.assertNotIn("access_token", json.dumps(payload))
        self.assertNotIn("refresh_token", json.dumps(payload))

    def test_conectar_devolve_url_com_state_valido(self):
        response = self.client.get("/api/mercadolivre/conectar")
        self.assertEqual(response.status_code, 200)
        url = httpx.URL(response.json()["url"])
        self.assertEqual(url.host, "auth.mercadolivre.com.br")
        self.assertEqual(url.params["client_id"], "CID")
        self.assertTrue(validar_state(url.params["state"], int(datetime.now().timestamp())))

    def test_callback_state_invalido_redireciona_erro(self):
        app.dependency_overrides.pop(get_current_user, None)
        response = self.client.get("/api/mercadolivre/callback?code=x&state=lixo")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["location"].endswith("?ml=erro"))

    def test_desconectar_apaga_linha(self):
        db = FakeDb({"id": 1, "nickname": "HORUS", "access_token": "A", "refresh_token": "R"})
        with patch("app.routers.mercadolivre.get_supabase", return_value=db):
            response = self.client.post("/api/mercadolivre/desconectar")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(db.row)


if __name__ == "__main__":
    unittest.main()
