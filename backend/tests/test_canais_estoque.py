# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162908-8f61
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: test_canais_estoque.py
# Assunto            : Testes de reserva e sincronizacao de estoque
# Origem             : solicitacao do usuario
# Motivo             : Cobrir por teste o calculo de quantidade, o envio e a fila
# Criado em          : 2026-11-18 16:29:08
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import unittest
from decimal import Decimal
from types import SimpleNamespace

import httpx

from app.services.canais.estoque import drenar_fila, quantidade_canal, reservas, sincronizar
from app.services.shopify.cliente import ShopifyErro

P1, P2 = "p1", "p2"
ANTES = "2026-11-18T10:00:00+00:00"


class FakeQuery:
    def __init__(self, db, nome):
        self.db, self.nome = db, nome
        self.op, self.payload, self.filtros = "select", None, []

    def select(self, *_):
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

    def execute(self):
        linhas = self.db.tabelas.setdefault(self.nome, [])
        alvo = [r for r in linhas if all(f(r) for f in self.filtros)]
        if self.op == "update":
            for r in alvo:
                r.update(self.payload)
        elif self.op == "delete":
            for r in alvo:
                linhas.remove(r)
        return SimpleNamespace(data=[dict(r) for r in alvo])


class FakeDb:
    def __init__(self, **tabelas):
        self.tabelas = tabelas

    def table(self, nome):
        return FakeQuery(self, nome)


class FakeCliente:
    def __init__(self, erro=None, location="gid://loc/1"):
        self.chamadas, self.erro, self.location_id = [], erro, location

    def graphql(self, query, variables=None):
        self.chamadas.append((query, variables))
        if self.erro:
            raise self.erro
        return {"inventorySetQuantities": {"userErrors": []}}


def vinculo(id, produto, tipo="frasco", ml=None):
    return {"id": id, "canal": "shopify", "produto_id": produto, "tipo": tipo, "ml": ml,
            "externo_estoque_id": f"gid://item/{id}", "ultima_qtd": None, "erro": None}


def montar(**extra):
    return FakeDb(
        canal_vinculos=[vinculo("v1", P1), vinculo("v2", P1, "decant", 5), vinculo("v3", P2)],
        produtos=[{"id": P1, "estoque_atual": 1, "volume_ml": 100}, {"id": P2, "estoque_atual": 4, "volume_ml": 50}],
        frascos_abertos=[{"produto_id": P1, "ml_restante": 7, "status": "ativo"}],
        pedidos_canal=[{"status": "a_confirmar", "itens": [{"produto_id": P1, "tipo": "decant", "ml": 5, "quantidade": 1}]}],
        canal_sync_fila=[{"produto_id": P1, "criado_em": ANTES}, {"produto_id": P2, "criado_em": ANTES}],
        **extra,
    )


class EstoqueTest(unittest.TestCase):
    def test_quantidade_frasco_desconta_reserva(self):
        self.assertEqual(quantidade_canal(5, 100, Decimal(0), "frasco", None, (2, Decimal(0))), 3)

    def test_quantidade_decant_divide_saldo(self):
        self.assertEqual(quantidade_canal(1, 100, Decimal(7), "decant", Decimal(5), (0, Decimal(5))), 20)

    def test_quantidade_decant_frasco_reservado_consome(self):
        self.assertEqual(quantidade_canal(2, 100, Decimal(0), "decant", Decimal(10), (1, Decimal(0))), 10)

    def test_quantidade_nunca_negativa(self):
        self.assertEqual(quantidade_canal(1, 100, Decimal(0), "frasco", None, (3, Decimal(0))), 0)
        self.assertEqual(quantidade_canal(0, 100, Decimal(0), "decant", Decimal(5), (0, Decimal(50))), 0)

    def test_reservas_ignora_confirmado_e_sem_produto(self):
        itens = lambda *i: list(i)
        r = reservas([
            {"status": "aguardando_pagamento", "itens": itens(
                {"produto_id": P1, "tipo": "frasco", "ml": None, "quantidade": 2},
                {"produto_id": None, "tipo": None, "ml": None, "quantidade": 9})},
            {"status": "a_confirmar", "itens": itens({"produto_id": P1, "tipo": "decant", "ml": 5, "quantidade": 3})},
            {"status": "confirmado", "itens": itens({"produto_id": P1, "tipo": "frasco", "ml": None, "quantidade": 7})},
        ])
        self.assertEqual(r, {P1: (2, Decimal(15))})

    def test_sincronizar_envia_e_limpa_fila(self):
        db, cli = montar(), FakeCliente()
        res = sincronizar(db, cli, None)
        self.assertEqual(res, {"enviados": 3, "erros": []})
        self.assertEqual(len(cli.chamadas), 1)
        qtds = {q["inventoryItemId"]: q["quantity"] for q in cli.chamadas[0][1]["input"]["quantities"]}
        # P1: frasco 1; decant (7+100-5)/5 = 20; P2: 4
        self.assertEqual(qtds, {"gid://item/v1": 1, "gid://item/v2": 20, "gid://item/v3": 4})
        v = {r["id"]: r for r in db.tabelas["canal_vinculos"]}
        self.assertEqual((v["v2"]["ultima_qtd"], v["v2"]["erro"]), (20, None))
        self.assertIsNotNone(v["v2"]["sincronizado_em"])
        self.assertEqual(db.tabelas["canal_sync_fila"], [])

    def test_sincronizar_falha_mantem_fila(self):
        db, cli = montar(), FakeCliente(erro=ShopifyErro("boom"))
        res = sincronizar(db, cli, [P1])
        self.assertEqual(res["enviados"], 0)
        self.assertEqual(len(res["erros"]), 1)
        self.assertIn("boom", db.tabelas["canal_vinculos"][0]["erro"])
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_erro_de_rede_mantem_fila(self):
        db = montar()
        res = sincronizar(db, FakeCliente(erro=httpx.ConnectError("sem rede")), None)
        self.assertEqual(res["enviados"], 0)
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_sem_location_e_erro(self):
        db = montar()
        res = sincronizar(db, FakeCliente(location=None), None)
        self.assertEqual(res["enviados"], 0)
        self.assertIn("reconecte", db.tabelas["canal_vinculos"][0]["erro"])
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_fila_alterada_durante_sync_nao_e_perdida(self):
        db = montar()
        db.tabelas["canal_sync_fila"][0]["criado_em"] = "2999-01-01T00:00:00+00:00"
        sincronizar(db, FakeCliente(), None)
        self.assertEqual([r["produto_id"] for r in db.tabelas["canal_sync_fila"]], [P1])

    def test_drenar_fila_sincroniza_so_a_fila(self):
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P2, "criado_em": ANTES}]
        cli = FakeCliente()
        res = drenar_fila(db, cli)
        self.assertEqual(res["enviados"], 1)
        self.assertEqual(db.tabelas["canal_sync_fila"], [])


if __name__ == "__main__":
    unittest.main()
