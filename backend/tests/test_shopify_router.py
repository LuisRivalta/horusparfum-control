# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-163443-879c
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: test_shopify_router.py
# Assunto            : Testes das rotas da Shopify e dos canais
# Origem             : solicitacao do usuario
# Motivo             : TDD das rotas da integracao Shopify pedida pelo Luis
# Criado em          : 2026-11-18 16:32:45
# Ultima modificacao : 2026-11-18 16:34:20
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import base64
import hashlib
import hmac
import json
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import get_current_user
from app.config import settings
from app.main import app
from app.routers import shopify as rota

SEGREDO = "segredo-app"
CONECTADO = "2026-11-18T12:00:00+00:00"
P1 = "11111111-1111-1111-1111-111111111111"


class FakeQuery:
    def __init__(self, db, nome):
        self.db, self.nome = db, nome
        self.op, self.payload, self.filtros = "select", None, []
        self.ordem, self.limite = None, None

    def select(self, *_):
        return self

    def upsert(self, payload, on_conflict, ignore_duplicates=False):
        self.op, self.payload = "upsert", payload
        self.conflito, self.ignorar = on_conflict.split(","), ignore_duplicates
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, campo, valor):
        self.filtros.append(lambda r: r.get(campo) == valor)
        return self

    def in_(self, campo, valores):
        self.filtros.append(lambda r: r.get(campo) in valores)
        return self

    def lte(self, campo, valor):
        self.filtros.append(lambda r: r.get(campo) <= valor)
        return self

    def order(self, campo, desc=False):
        self.ordem = (campo, desc)
        return self

    def limit(self, n):
        self.limite = n
        return self

    def execute(self):
        linhas = self.db.tabelas.setdefault(self.nome, [])
        if self.op == "upsert":
            saida = []
            for item in self.payload if isinstance(self.payload, list) else [self.payload]:
                chave = [item[c] for c in self.conflito]
                achou = next((r for r in linhas if [r.get(c) for c in self.conflito] == chave), None)
                if achou is None:
                    novo = {"id": f"gerado{len(linhas)}", **item}  # como o default do banco
                    linhas.append(novo)
                    saida.append(dict(novo))
                elif not self.ignorar:
                    achou.update(item)
                    saida.append(dict(achou))
            return SimpleNamespace(data=saida)
        alvo = [r for r in linhas if all(f(r) for f in self.filtros)]
        if self.op == "update":
            for r in alvo:
                r.update(self.payload)
        elif self.op == "delete":
            for r in alvo:
                linhas.remove(r)
        if self.ordem:
            alvo.sort(key=lambda r: r.get(self.ordem[0]) or "", reverse=self.ordem[1])
        if self.limite:
            alvo = alvo[: self.limite]
        return SimpleNamespace(data=[dict(r) for r in alvo])


class FakeDb:
    def __init__(self, **tabelas):
        self.tabelas = tabelas

    def table(self, nome):
        return FakeQuery(self, nome)


def conexao(**extra):
    return {"id": 1, "access_token": "TOK", "expires_at": "2099-01-01T00:00:00+00:00",
            "location_id": "gid://shopify/Location/1", "conectado_em": CONECTADO, **extra}


def vinculo(**extra):
    return {"id": "v1", "canal": "shopify", "produto_id": P1, "tipo": "frasco", "ml": None,
            "externo_variante_id": "777", "externo_estoque_id": "gid://shopify/InventoryItem/9", **extra}


def pedido_webhook(**extra):
    p = {
        "id": 5001, "name": "#1001", "created_at": "2026-11-18T10:30:00-03:00",
        "financial_status": "paid", "cancelled_at": None,
        "customer": {"first_name": "Ana", "last_name": "Silva"},
        "total_price": "100.00", "shipping_lines": [], "refunds": [],
        "line_items": [{"variant_id": 777, "title": "Perfume X", "variant_title": None,
                        "quantity": 1, "price": "100.00", "discount_allocations": []}],
    }
    p.update(extra)
    return p


def assinar(corpo: bytes) -> str:
    return base64.b64encode(hmac.new(SEGREDO.encode(), corpo, hashlib.sha256).digest()).decode()


class Shopify:
    """Loja falsa: responde token e GraphQL pelo conteúdo da query."""

    def __init__(self, pedidos=(), produtos=(), webhook_erro=None):
        self.pedidos, self.produtos, self.webhook_erro = list(pedidos), list(produtos), webhook_erro
        self.queries = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/oauth/access_token"):
            return httpx.Response(200, json={"access_token": "NOVO", "expires_in": 86399})
        corpo = json.loads(req.content)
        q, v = corpo["query"], corpo.get("variables") or {}
        self.queries.append((q, v))
        if "locations" in q:
            return httpx.Response(200, json={"data": {"locations": {"nodes": [{"id": "gid://shopify/Location/7"}]}}})
        if "webhookSubscriptionCreate" in q:
            erros = [{"field": ["webhookSubscription"], "message": self.webhook_erro}] if self.webhook_erro else []
            return httpx.Response(200, json={"data": {"webhookSubscriptionCreate": {"webhookSubscription": None, "userErrors": erros}}})
        if "inventorySetQuantities" in q:
            return httpx.Response(200, json={"data": {"inventorySetQuantities": {"userErrors": []}}})
        if "orders(" in q:
            pagina = 1 if v.get("cursor") else 0
            nodes = self.pedidos[pagina * 1:(pagina + 1) * 1] if len(self.pedidos) > 1 else self.pedidos
            return httpx.Response(200, json={"data": {"orders": {
                "pageInfo": {"hasNextPage": len(self.pedidos) > 1 and pagina == 0, "endCursor": "c1"},
                "nodes": nodes}}})
        if "products(" in q:
            return httpx.Response(200, json={"data": {"products": {
                "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": self.produtos}}})
        raise AssertionError(q)

    def mutations(self, nome):
        return [x for x in self.queries if nome in x[0]]


def dinheiro(v):
    return {"shopMoney": {"amount": v}}


def pedido_graphql(legacy, criado="2026-11-18T13:00:00Z"):
    return {
        "legacyResourceId": legacy, "name": f"#{legacy}", "createdAt": criado,
        "displayFinancialStatus": "PAID", "cancelledAt": None, "customer": {"displayName": "Ana"},
        "totalPriceSet": dinheiro("100.00"), "totalShippingPriceSet": dinheiro("0.00"),
        "totalRefundedSet": dinheiro("0.00"),
        "lineItems": {"nodes": [{"title": "Perfume X", "variantTitle": None, "quantity": 1,
                                 "variant": {"legacyResourceId": "777"},
                                 "discountedUnitPriceAfterAllDiscountsSet": dinheiro("100.00")}]},
    }


class RotasTest(unittest.TestCase):
    def setUp(self):
        p = patch.multiple(settings, shopify_loja="loja.myshopify.com", shopify_client_id="CID",
                           shopify_client_secret=SEGREDO, horus_sync_secret="")
        p.start()
        self.addCleanup(p.stop)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u1"}
        self.addCleanup(app.dependency_overrides.clear)
        self.http = TestClient(app)

    def usar(self, db, loja):
        self.db, self.loja = db, loja
        app.dependency_overrides[rota.obter_db] = lambda: db
        app.dependency_overrides[rota.obter_http] = lambda: httpx.Client(transport=httpx.MockTransport(loja))

    def base_db(self, **extra):
        tabelas = dict(shopify_conexao=[conexao()], canal_vinculos=[vinculo()],
                       produtos=[{"id": P1, "estoque_atual": 5, "volume_ml": 100, "tipo_id": "t-creme"}],
                       tipos_produto=[{"id": "t-creme", "vende_decant": False}],
                       pedidos_canal=[], canal_sync_fila=[], frascos_abertos=[])
        tabelas.update(extra)
        return FakeDb(**tabelas)

    def postar_webhook(self, payload, assinatura=None):
        corpo = json.dumps(payload).encode()
        return self.http.post("/api/shopify/webhooks/pedidos", content=corpo,
                              headers={"X-Shopify-Hmac-Sha256": assinatura or assinar(corpo),
                                       "Content-Type": "application/json"})

    def test_webhook_hmac_invalido(self):
        self.usar(self.base_db(), Shopify())
        r = self.postar_webhook(pedido_webhook(), assinatura="errada")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.db.tabelas["pedidos_canal"], [])

    def test_webhook_valido_grava_e_sincroniza(self):
        self.usar(self.base_db(), Shopify())
        r = self.postar_webhook(pedido_webhook())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {})
        [pedido] = self.db.tabelas["pedidos_canal"]
        self.assertEqual(pedido["status"], "a_confirmar")
        self.assertEqual(pedido["itens"][0]["produto_id"], P1)
        [(_, v)] = self.loja.mutations("inventorySetQuantities")
        self.assertEqual(v["input"]["quantities"][0]["quantity"], 4)  # 5 em estoque - 1 reservado
        self.assertEqual(self.db.tabelas["canal_sync_fila"], [])

    def test_webhook_falha_de_sync_fica_na_fila(self):
        db = self.base_db(shopify_conexao=[conexao(location_id=None)])
        self.usar(db, Shopify())
        r = self.postar_webhook(pedido_webhook())
        self.assertEqual(r.status_code, 200)
        self.assertEqual([f["produto_id"] for f in db.tabelas["canal_sync_fila"]], [P1])

    def test_webhook_repetido_uma_linha(self):
        self.usar(self.base_db(), Shopify())
        self.assertEqual(self.postar_webhook(pedido_webhook()).status_code, 200)
        self.assertEqual(self.postar_webhook(pedido_webhook()).status_code, 200)
        self.assertEqual(len(self.db.tabelas["pedidos_canal"]), 1)

    def test_sync_sem_segredo_401(self):
        self.usar(self.base_db(), Shopify())
        self.assertEqual(self.http.post("/api/canais/sync", headers={"X-Horus-Sync": ""}).status_code, 401)
        self.assertEqual(self.http.post("/api/canais/sync").status_code, 401)

    def test_sync_com_segredo_drena_fila(self):
        db = self.base_db(canal_sync_fila=[{"produto_id": P1, "criado_em": "2026-11-18T12:00:00+00:00"}])
        self.usar(db, Shopify())
        with patch.object(settings, "horus_sync_secret", "abc"):
            self.assertEqual(self.http.post("/api/canais/sync", headers={"X-Horus-Sync": "x"}).status_code, 401)
            r = self.http.post("/api/canais/sync", headers={"X-Horus-Sync": "abc"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["enviados"], 1)
        self.assertEqual(db.tabelas["canal_sync_fila"], [])

    def test_conferir_ingere_pedidos(self):
        antigo = {"canal": "shopify", "externo_id": "1", "status": "a_confirmar", "itens": [],
                  "updated_at": "2026-11-18T14:00:00+00:00"}
        db = self.base_db(pedidos_canal=[antigo])
        loja = Shopify(pedidos=[pedido_graphql("1"), pedido_graphql("2")])
        self.usar(db, loja)
        r = self.http.post("/api/canais/pedidos/conferir")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"novos": 1})
        self.assertEqual(sorted(p["externo_id"] for p in db.tabelas["pedidos_canal"]), ["1", "2"])
        consultas = [v for q, v in loja.queries if "orders(" in q]
        self.assertEqual(len(consultas), 2)  # paginou
        self.assertIn("updated_at:>='2026-11-18T14:00:00Z'", consultas[0]["q"])
        self.assertEqual(consultas[1]["cursor"], "c1")
        self.assertEqual(len(loja.mutations("inventorySetQuantities")), 1)

    def test_vinculo_decant_em_creme_422(self):
        self.usar(self.base_db(canal_vinculos=[]), Shopify())
        corpo = {"variante_id": "888", "produto_ext_id": "55", "estoque_id": "gid://shopify/InventoryItem/8",
                 "titulo": "Creme — 5ml", "produto_id": P1, "tipo": "decant", "ml": 5}
        self.assertEqual(self.http.post("/api/shopify/vinculos", json=corpo).status_code, 422)
        self.assertEqual(self.http.post("/api/shopify/vinculos", json={**corpo, "tipo": "frasco"}).status_code, 422)
        self.assertEqual(self.db.tabelas["canal_vinculos"], [])
        r = self.http.post("/api/shopify/vinculos", json={**corpo, "tipo": "frasco", "ml": None})
        self.assertEqual(r.status_code, 200)
        [v] = self.db.tabelas["canal_vinculos"]
        self.assertEqual((v["externo_variante_id"], v["tipo"], v["ml"]), ("888", "frasco", None))
        self.assertEqual(len(self.loja.mutations("inventorySetQuantities")), 1)
        self.assertEqual(self.http.delete("/api/shopify/vinculos/888").status_code, 200)
        self.assertEqual(self.db.tabelas["canal_vinculos"], [])

    def test_conexao_nao_expoe_token(self):
        self.usar(self.base_db(), Shopify())
        r = self.http.get("/api/shopify/conexao")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"conectado": True, "loja": "loja.myshopify.com", "conectado_em": CONECTADO})
        self.assertNotIn("TOK", r.text)
        self.usar(self.base_db(shopify_conexao=[]), Shopify())
        self.assertFalse(self.http.get("/api/shopify/conexao").json()["conectado"])

    def test_conectar_assina_webhooks_e_mantem_corte(self):
        db = self.base_db(shopify_conexao=[conexao(location_id=None)])
        loja = Shopify(webhook_erro="Address for this topic has already been taken")
        self.usar(db, loja)
        r = self.http.post("/api/shopify/conectar")
        self.assertEqual(r.status_code, 200, r.text)
        [linha] = db.tabelas["shopify_conexao"]
        self.assertEqual((linha["access_token"], linha["location_id"], linha["conectado_em"]),
                         ("NOVO", "gid://shopify/Location/7", CONECTADO))
        subs = loja.mutations("webhookSubscriptionCreate")
        self.assertEqual(sorted(v["topic"] for _, v in subs), ["ORDERS_CREATE", "ORDERS_UPDATED"])
        self.assertEqual(subs[0][1]["uri"], "https://testserver/api/shopify/webhooks/pedidos")

    def test_conectar_primeira_vez_grava_corte(self):
        db = self.base_db(shopify_conexao=[])
        self.usar(db, Shopify())
        self.assertEqual(self.http.post("/api/shopify/conectar").status_code, 200)
        self.assertTrue(db.tabelas["shopify_conexao"][0]["conectado_em"])

    def test_conectar_sem_variaveis_503(self):
        self.usar(self.base_db(), Shopify())
        with patch.object(settings, "shopify_client_id", ""):
            self.assertEqual(self.http.post("/api/shopify/conectar").status_code, 503)

    def test_desconectado_409(self):
        self.usar(self.base_db(shopify_conexao=[]), Shopify())
        r = self.http.post("/api/canais/sincronizar")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "Shopify não conectada")

    def test_variantes_com_vinculo(self):
        produtos = [{"legacyResourceId": "55", "title": "Perfume X", "variants": {"nodes": [
            {"legacyResourceId": "777", "title": "100ml", "sku": "PX100", "inventoryItem": {"id": "gid://shopify/InventoryItem/9"}},
            {"legacyResourceId": "778", "title": "5ml", "sku": None, "inventoryItem": {"id": "gid://shopify/InventoryItem/10"}},
        ]}}]
        self.usar(self.base_db(), Shopify(produtos=produtos))
        r = self.http.get("/api/shopify/variantes")
        self.assertEqual(r.status_code, 200)
        corpo = r.json()
        self.assertIsNone(corpo["proximo"])
        a, b = corpo["itens"]
        self.assertEqual(a["vinculo"], {"produto_id": P1, "tipo": "frasco", "ml": None})
        self.assertEqual((a["produto_id_ext"], a["variante_id"], a["estoque_id"]), ("55", "777", "gid://shopify/InventoryItem/9"))
        self.assertIsNone(b["vinculo"])


if __name__ == "__main__":
    unittest.main()
