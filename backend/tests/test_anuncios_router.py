# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-155817-f934
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Testes rotas anuncios
# Assunto            : Testes das rotas de anuncios com banco e ML falsos
# Origem             : automatico (hook)
# Motivo             : Registro automatico (hook Edit); a razao detalhada vem no registro manual do Claude, se houver
# Criado em          : 2026-11-16 15:24:58
# Ultima modificacao : 2026-11-16 15:58:17
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
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
from app.main import app
from app.routers import anuncios as rota
from app.services.mercadolivre import MLDesconectado, MLErro


class FakeQuery:
    def __init__(self, db, nome):
        self.db, self.nome = db, nome
        self.op, self.payload, self.filtros = "select", None, []

    def select(self, *_):
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def eq(self, campo, valor):
        self.filtros.append(lambda r: r.get(campo) == valor)
        return self

    def execute(self):
        if self.op == "insert":
            self.db.tabelas.setdefault(self.nome, []).append(dict(self.payload))
            return SimpleNamespace(data=[dict(self.payload)])
        linhas = [r for r in self.db.tabelas.get(self.nome, []) if all(f(r) for f in self.filtros)]
        if self.op == "update":
            for r in linhas:
                r.update(self.payload)
        return SimpleNamespace(data=[dict(r) for r in linhas])


class FakeDb:
    def __init__(self, **tabelas):
        self.tabelas = tabelas

    def table(self, nome):
        return FakeQuery(self, nome)


class FakeML:
    user_product = False
    ml_user_id = 1

    def __init__(self, falhar_titulos=(), falhar_descricao=False, desconectado=False, respostas=None, excecoes=None):
        self.falhar_titulos = set(falhar_titulos)
        self.falhar_descricao = falhar_descricao
        self.desconectado = desconectado
        self.respostas = respostas or {}
        self.excecoes = excecoes or {}  # (método, path) -> exceção a lançar
        self.chamadas = []
        self.n = 0

    def _ver(self):
        if self.desconectado:
            raise MLDesconectado()

    def get(self, path, params=None):
        self._ver()
        self.chamadas.append(("GET", path))
        if ("GET", path) in self.excecoes:
            raise self.excecoes[("GET", path)]
        if path in self.respostas:
            r = self.respostas[path]
            return r(params) if callable(r) else r
        if path.startswith("/items/"):
            return {"status": "active"}
        raise AssertionError(path)

    def post(self, path, json):
        self._ver()
        self.chamadas.append(("POST", path))
        if ("POST", path) in self.excecoes:
            raise self.excecoes[("POST", path)]
        if path == "/items":
            if json["title"] in self.falhar_titulos:
                self.falhar_titulos.discard(json["title"])
                raise MLErro(400, "Foto recusada")
            self.n += 1
            return {"id": f"MLB{self.n}", "permalink": f"https://ml/{self.n}", "status": "active"}
        if path.endswith("/description") and self.falhar_descricao:
            raise MLErro(400, "Descrição inválida")
        return {}

    def put(self, path, json):
        self._ver()
        self.chamadas.append(("PUT", path, json))
        return {}


def anuncio(i, **extra):
    return {"id": f"a{i}", "produto_id": "p1", "tipo": "frasco", "ml": None, "listing_type": "gold_special",
            "preco": 199.9, "titulo": f"T{i}", "descricao": "desc", "fotos": ["https://f/1.jpg"],
            "status": "rascunho", "ml_item_id": None, **extra}


def banco(anuncios):
    return FakeDb(
        anuncios=anuncios,
        produtos=[{"id": "p1", "nome": "Asad", "volume_ml": 100, "marca_id": "m1", "estoque_atual": 3,
                   "gtin": None, "ficha": {}}],
        marcas=[{"id": "m1", "nome": "Lattafa"}],
        frascos_abertos=[{"produto_id": "p1", "ml_restante": 40, "status": "ativo"}],
        insumo_listas=[{"tipo": "envio_frasco", "peso_g": 300, "altura_cm": 10, "largura_cm": 10, "comprimento_cm": 20}],
        anuncios_config=[{"id": 1, "ia_ativa": True, "modelo_descricao": ""}],
    )


class AnunciosRouterTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: {"sub": "u1"}
        self.addCleanup(app.dependency_overrides.clear)
        self.http = TestClient(app)

    def usar(self, db, ml):
        app.dependency_overrides[rota.obter_db] = lambda: db
        app.dependency_overrides[rota.obter_cliente_ml] = lambda: ml

    def posts_items(self, ml):
        return [c for c in ml.chamadas if c[:2] == ("POST", "/items")]

    def test_publicar_falha_no_terceiro_nao_desfaz(self):
        db, ml = banco([anuncio(i) for i in range(1, 5)]), FakeML(falhar_titulos={"T3"})
        self.usar(db, ml)
        ids = ["a1", "a2", "a3", "a4"]
        r = self.http.post("/api/anuncios/publicar", json={"ids": ids}).json()["resultados"]
        self.assertEqual([x["status"] for x in r], ["publicado", "publicado", "erro", "publicado"])
        self.assertEqual(r[2]["erro"], "Foto recusada")
        self.assertEqual(db.tabelas["anuncios"][2]["erro"], "Foto recusada")
        self.assertEqual(len(self.posts_items(ml)), 4)

        r = self.http.post("/api/anuncios/publicar", json={"ids": ids}).json()["resultados"]
        self.assertEqual([x["status"] for x in r], ["publicado"] * 4)
        self.assertEqual(len(self.posts_items(ml)), 5)
        self.assertEqual(db.tabelas["anuncios"][2]["ml_item_id"], "MLB4")
        self.assertIsNone(db.tabelas["anuncios"][2]["erro"])

    def test_publicar_descricao_falhou_nao_duplica(self):
        db, ml = banco([anuncio(1)]), FakeML(falhar_descricao=True)
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        self.assertEqual(r[0]["status"], "publicado")
        self.assertEqual(r[0]["ml_item_id"], "MLB1")
        self.assertEqual(r[0]["erro"], "Descrição: Descrição inválida")
        linha = db.tabelas["anuncios"][0]
        self.assertEqual((linha["status"], linha["ml_item_id"]), ("publicado", "MLB1"))
        self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]})
        self.assertEqual(len(self.posts_items(ml)), 1)

    def test_publicar_item_fechado_grava_sub_status(self):
        db = banco([anuncio(1)])
        ml = FakeML(respostas={"/items/MLB1": {"status": "closed", "sub_status": ["deleted"]}})
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        self.assertIn("deleted", r[0]["erro"])
        self.assertIn("deleted", db.tabelas["anuncios"][0]["erro"])

    def test_descricao_desconectado_fica_publicado_com_erro(self):
        db = banco([anuncio(1)])
        ml = FakeML(excecoes={("POST", "/items/MLB1/description"): MLDesconectado()})
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]})
        self.assertEqual(r.status_code, 200)
        linha = db.tabelas["anuncios"][0]
        self.assertEqual((linha["status"], linha["ml_item_id"]), ("publicado", "MLB1"))
        self.assertTrue(linha["erro"].startswith("Descrição:"))

    def test_timeout_na_conferencia_mantem_publicado(self):
        db = banco([anuncio(1)])
        ml = FakeML(excecoes={("GET", "/items/MLB1"): httpx.ReadTimeout("tempo esgotado")})
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        self.assertEqual(r[0]["status"], "publicado")
        linha = db.tabelas["anuncios"][0]
        self.assertEqual((linha["status"], linha["ml_item_id"]), ("publicado", "MLB1"))

    def test_falha_de_rede_no_post_items_vira_erro_sem_ml_item_id(self):
        db = banco([anuncio(1)])
        self.usar(db, FakeML(excecoes={("POST", "/items"): httpx.ConnectTimeout("rede")}))
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        self.assertEqual(r[0]["status"], "erro")
        self.assertEqual(r[0]["erro"], "Falha de rede ao publicar: confira no ML antes de tentar de novo")
        self.assertIsNone(db.tabelas["anuncios"][0]["ml_item_id"])

    def test_perfume_sem_marca_nao_chama_ml(self):
        db = banco([anuncio(1)])
        db.tabelas["produtos"][0]["marca_id"] = None
        ml = FakeML()
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        self.assertEqual((r[0]["status"], r[0]["erro"]), ("erro", "Perfume sem marca"))
        self.assertEqual(db.tabelas["anuncios"][0]["erro"], "Perfume sem marca")
        self.assertEqual(self.posts_items(ml), [])

    def test_falha_inesperada_com_item_criado_nao_vira_erro(self):
        db = banco([anuncio(1)])
        self.usar(db, FakeML())

        def quebra(db_, cliente, anuncio_id):
            db_.tabelas["anuncios"][0].update(status="publicado", ml_item_id="MLB7")
            raise KeyError("x")

        with patch.object(rota, "publicar_um", quebra):
            r = self.http.post("/api/anuncios/publicar", json={"ids": ["a1"]}).json()["resultados"]
        linha = db.tabelas["anuncios"][0]
        self.assertEqual((linha["status"], linha["ml_item_id"]), ("publicado", "MLB7"))
        self.assertEqual(r[0]["status"], "publicado")
        self.assertIn("KeyError", linha["erro"])

    def test_precos_sem_conexao_409(self):
        self.usar(banco([]), FakeML(desconectado=True))
        pacote = {"peso_g": 300, "altura_cm": 10, "largura_cm": 10, "comprimento_cm": 20}
        r = self.http.post("/api/anuncios/precos", json={
            "itens": [{"chave": "frasco", "custo": 100, "margem": 0.6, "tipo": "frasco"}],
            "pacotes": {"frasco": pacote, "decant": pacote},
        })
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json(), {"detail": "Conecte a conta do Mercado Livre"})

    def test_precos_erro_por_tipo_sem_medidas(self):
        taxas = {"sale_fee_amount": 20, "sale_fee_details": {"fixed_fee": 0}, "listing_type_id": "gold_special"}
        self.usar(banco([]), FakeML(respostas={"/sites/MLB/listing_prices": taxas}))
        vazio = {"peso_g": None, "altura_cm": None, "largura_cm": None, "comprimento_cm": None}
        r = self.http.post("/api/anuncios/precos", json={
            "itens": [{"chave": "frasco", "custo": 100, "margem": 0.6, "tipo": "frasco"}],
            "pacotes": {"frasco": vazio, "decant": vazio},
        })
        self.assertEqual(r.status_code, 200)
        item = r.json()["itens"][0]
        self.assertEqual(item["chave"], "frasco")
        self.assertEqual(item["gold_special"], {"erro": "Preencha peso e medidas do kit de envio"})

    def test_qualidade_lista_pendencias(self):
        perf = {"score": 72, "level_wording": "Profissional", "buckets": [{"variables": [{"rules": [
            {"status": "COMPLETED", "wordings": {"title": "ok", "label": "ok", "link": "https://x/ok"}},
            {"status": "PENDING", "wordings": {"title": "Fotos", "label": "Adicione fotos", "link": "https://x/fotos"}},
        ]}]}]}
        db = banco([anuncio(1, status="publicado", ml_item_id="MLB9")])
        self.usar(db, FakeML(respostas={"/item/MLB9/performance": perf}))
        r = self.http.get("/api/anuncios/a1/qualidade").json()
        self.assertEqual(r["score"], 72)
        self.assertEqual(r["nivel"], "Profissional")
        self.assertEqual(r["pendencias"], [{"titulo": "Fotos", "texto": "Adicione fotos", "link": "https://x/fotos"}])
        self.assertEqual(db.tabelas["anuncios"][0]["qualidade_score"], 72)

    def test_quantidade_status_e_preco(self):
        db = banco([anuncio(1, tipo="decant", ml=10, status="publicado", ml_item_id="MLB9")])
        ml = FakeML()
        self.usar(db, ml)
        self.assertEqual(self.http.post("/api/anuncios/a1/quantidade").json(), {"quantidade": 34})
        self.http.post("/api/anuncios/a1/status", json={"status": "paused"})
        self.assertEqual(db.tabelas["anuncios"][0]["status"], "pausado")
        self.http.post("/api/anuncios/a1/preco", json={"preco": 49.9})
        self.assertEqual(db.tabelas["anuncios"][0]["preco"], 49.9)
        self.assertEqual([c[2] for c in ml.chamadas], [
            {"available_quantity": 34}, {"status": "paused"}, {"price": 49.9}])

    def test_itens_da_conta_pagina_e_marca_ligados(self):
        ids = [f"MLB{i}" for i in range(1, 126)]  # 100 + 25 -> 2 páginas de search, 7 lotes de bulk
        buscas, bulks = [], []

        def search(params):
            buscas.append(params["offset"])
            return {"results": ids[params["offset"]:params["offset"] + 100],
                    "paging": {"total": 125, "offset": params["offset"], "limit": 100}}

        def bulk(params):
            lote = params["ids"].split(",")
            bulks.append(len(lote))
            return [{"code": 404, "body": {}} if i == "MLB3" else {"code": 200, "body": {
                "id": i, "title": f"Item {i}", "price": 10.5, "available_quantity": 2, "status": "active",
                "permalink": f"https://ml/{i}", "listing_type_id": "gold_special",
                "attributes": [{"id": "UNIT_VOLUME", "value_name": "5 mL"}] if i == "MLB1"
                else [{"id": "UNIT_VOLUME", "value_name": "2,5 mL"}] if i == "MLB2" else []}} for i in lote]

        db = banco([anuncio(1, ml_item_id="MLB2")])
        self.usar(db, FakeML(respostas={"/users/1/items/search": search, "/items/bulk": bulk}))
        itens = self.http.get("/api/anuncios/conta/itens").json()["itens"]
        self.assertEqual(buscas, [0, 100])
        self.assertEqual(bulks, [20] * 6 + [5])
        self.assertEqual(len(itens), 124)  # MLB3 (code 404) fora
        por_id = {i["ml_item_id"]: i for i in itens}
        self.assertEqual(por_id["MLB1"]["volume_ml"], 5.0)
        self.assertEqual(por_id["MLB2"]["volume_ml"], 2.5)
        self.assertIsNone(por_id["MLB4"]["volume_ml"])
        self.assertFalse(por_id["MLB1"]["ligado"])
        self.assertTrue(por_id["MLB2"]["ligado"])
        self.assertEqual(por_id["MLB1"]["quantidade"], 2)

    def test_ligar_insere_com_status_do_ml(self):
        db = banco([])
        db.tabelas["anuncios_config"][0]["canal_id"] = "c1"
        ml = FakeML(respostas={"/items/MLB7": {
            "id": "MLB7", "title": "Asad 5ml", "price": 29.9, "status": "paused",
            "permalink": "https://ml/7", "listing_type_id": "gold_pro"}})
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/ligar", json={"ml_item_id": "MLB7", "produto_id": "p1", "tipo": "decant", "ml": 5})
        self.assertEqual(r.status_code, 200)
        a = db.tabelas["anuncios"][0]
        self.assertEqual((a["status"], a["preco"], a["titulo"], a["listing_type"], a["canal_id"], a["ml"]),
                         ("pausado", 29.9, "Asad 5ml", "gold_pro", "c1", 5))

    def test_ligar_tipo_nao_suportado_400(self):
        db = banco([])
        self.usar(db, FakeML(respostas={"/items/MLB7": {"id": "MLB7", "status": "active", "listing_type_id": "free"}}))
        r = self.http.post("/api/anuncios/ligar", json={"ml_item_id": "MLB7", "produto_id": "p1", "tipo": "frasco", "ml": None})
        self.assertEqual((r.status_code, r.json()["detail"]), (400, "Tipo de anúncio não suportado"))

    def test_ligar_duplicado_409(self):
        db = banco([anuncio(1, ml_item_id="MLB7")])
        ml = FakeML()
        self.usar(db, ml)
        r = self.http.post("/api/anuncios/ligar", json={"ml_item_id": "MLB7", "produto_id": "p1", "tipo": "frasco", "ml": None})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(len(db.tabelas["anuncios"]), 1)

    def test_ia_textos_desligada_409(self):
        db = banco([])
        db.tabelas["anuncios_config"][0]["ia_ativa"] = False
        self.usar(db, FakeML())
        r = self.http.post("/api/anuncios/ia/textos", json={"produto_id": "p1", "anuncios": []})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json(), {"detail": "IA desligada"})


if __name__ == "__main__":
    unittest.main()
