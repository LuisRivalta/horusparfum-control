# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-164159-41bd
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: test_shopify_publicar.py
# Assunto            : Testes da publicacao de produto
# Origem             : solicitacao do usuario
# Motivo             : Cobrir montagem, vinculos, 409 e falha de rede
# Criado em          : 2026-11-18 16:40:52
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from test_shopify_router import FakeDb, P1, Shopify, conexao
from app.auth.deps import get_current_user
from app.config import settings
from app.main import app
from app.routers import shopify as rota
from app.services.shopify.publicar import montar_produto

LOC = "gid://shopify/Location/1"


def dados(tipo="Perfume", volume=100, variantes=None):
    return {
        "titulo": "Perfume X", "descricao": "linha 1\nlinha <2>", "fotos": ["http://a/1.jpg", ""],
        "tipo_produto": tipo, "volume_ml": volume,
        "variantes": variantes or [
            {"tipo": "frasco", "ml": None, "preco": "129.9"},
            {"tipo": "decant", "ml": "2.5", "preco": "19"},
            {"tipo": "decant", "ml": "5", "preco": "35.50"},
        ],
    }


class LojaPublicar(Shopify):
    def __init__(self, falha_rede=False):
        super().__init__()
        self.falha_rede = falha_rede

    def __call__(self, req):
        if not req.url.path.endswith("/oauth/access_token"):
            corpo = json.loads(req.content)
            if "productSet" in corpo["query"]:
                if self.falha_rede:
                    raise httpx.ConnectError("caiu")
                self.queries.append((corpo["query"], corpo["variables"]))
                rotulos = [v["optionValues"][0]["name"] for v in corpo["variables"]["input"]["variants"]]
                nodes = [{"legacyResourceId": str(100 + i), "selectedOptions": [{"name": "Tamanho", "value": r}],
                          "inventoryItem": {"id": f"gid://shopify/InventoryItem/{i}"}, "title": r}
                         for i, r in reversed(list(enumerate(rotulos)))]  # fora de ordem de propósito
                return httpx.Response(200, json={"data": {"productSet": {
                    "product": {"legacyResourceId": "55", "variants": {"nodes": nodes}}, "userErrors": []}}})
        return super().__call__(req)


class MontarTest(unittest.TestCase):
    def test_montar_produto_perfume_com_decants(self):
        p = montar_produto(dados(), LOC)
        self.assertEqual(p["status"], "ACTIVE")
        self.assertEqual(p["productOptions"], [{"name": "Tamanho", "values": [
            {"name": "Frasco 100 ml"}, {"name": "Decant 2,5 ml"}, {"name": "Decant 5 ml"}]}])
        self.assertEqual([v["price"] for v in p["variants"]], ["129.90", "19.00", "35.50"])
        self.assertEqual(p["variants"][0], {
            "optionValues": [{"optionName": "Tamanho", "name": "Frasco 100 ml"}], "price": "129.90",
            "inventoryItem": {"tracked": True},
            "inventoryQuantities": [{"locationId": LOC, "name": "available", "quantity": 0}]})
        self.assertEqual(p["files"], [{"originalSource": "http://a/1.jpg", "contentType": "IMAGE"}])

    def test_montar_produto_creme_rotulo(self):
        p = montar_produto(dados("Creme", 50, [{"tipo": "frasco", "ml": None, "preco": "10"}]), LOC)
        self.assertEqual(p["productOptions"][0]["values"], [{"name": "50 ml"}])

    def test_descricao_escapada(self):
        self.assertEqual(montar_produto(dados(), LOC)["descriptionHtml"], "linha 1<br>linha &lt;2&gt;")


class PublicarTest(unittest.TestCase):
    def setUp(self):
        p = patch.multiple(settings, shopify_loja="loja.myshopify.com", horus_sync_secret="")
        p.start()
        self.addCleanup(p.stop)
        app.dependency_overrides[get_current_user] = lambda: {"id": "u"}
        self.http = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def usar(self, loja, vinculos=()):
        self.db = FakeDb(
            shopify_conexao=[conexao()], canal_vinculos=list(vinculos),
            produtos=[{"id": P1, "estoque_atual": 5, "volume_ml": 100, "tipo_id": "t-perf"}],
            tipos_produto=[{"id": "t-perf", "nome": "Perfume", "vende_decant": True}],
            pedidos_canal=[], canal_sync_fila=[], frascos_abertos=[])
        app.dependency_overrides[rota.obter_db] = lambda: self.db
        app.dependency_overrides[rota.obter_http] = lambda: httpx.Client(transport=httpx.MockTransport(loja))
        self.loja = loja

    def corpo(self):
        return {"produto_id": P1, "titulo": "Perfume X", "descricao": "d", "fotos": [],
                "variantes": [{"tipo": "frasco", "ml": None, "preco": "129.90"},
                              {"tipo": "decant", "ml": 2.5, "preco": "19"},
                              {"tipo": "decant", "ml": 5, "preco": "35.50"}]}

    def test_publicar_grava_vinculos(self):
        self.usar(LojaPublicar())
        r = self.http.post("/api/shopify/produtos", json=self.corpo())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {"produto_ext_id": "55", "variantes": 3})
        v = {(x["tipo"], x["ml"]): x for x in self.db.tabelas["canal_vinculos"]}
        # casou pelo rótulo, não pela ordem (a loja devolve invertido)
        self.assertEqual(v[("frasco", None)]["externo_variante_id"], "100")
        self.assertEqual(v[("decant", 2.5)]["externo_variante_id"], "101")
        self.assertEqual(v[("decant", 5.0)]["externo_estoque_id"], "gid://shopify/InventoryItem/2")
        self.assertEqual({x["externo_produto_id"] for x in v.values()}, {"55"})
        self.assertTrue(self.loja.mutations("inventorySetQuantities"))

    def test_publicar_duas_vezes_409(self):
        self.usar(LojaPublicar(), [{"canal": "shopify", "produto_id": P1, "tipo": "frasco", "ml": None,
                                    "externo_variante_id": "1"}])
        r = self.http.post("/api/shopify/produtos", json=self.corpo())
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "Produto já está na Shopify: use Ligar produtos")
        self.assertEqual(self.loja.mutations("productSet"), [])

    def test_falha_de_rede_502(self):
        self.usar(LojaPublicar(falha_rede=True))
        r = self.http.post("/api/shopify/produtos", json=self.corpo())
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.json()["detail"], "Falha de rede: confira na Shopify antes de tentar de novo")

    def test_sincronizacao_falha_nao_derruba(self):
        self.usar(LojaPublicar())
        with patch.object(rota, "sincronizar", side_effect=RuntimeError("x")):
            r = self.http.post("/api/shopify/produtos", json=self.corpo())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self.db.tabelas["canal_vinculos"]), 3)
