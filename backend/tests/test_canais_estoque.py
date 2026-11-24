# [CLAUDE-CODE-AUDIT]
# ID                 : 20261124-105747-e2ef
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: test_canais_estoque.py
# Assunto            : Testes de reserva e sincronizacao de estoque
# Origem             : solicitacao do usuario
# Motivo             : Testes da mutation nova, da limpeza pelo par lido, da renovacao e perda do lease e da nova tentativa ao soltar
# Criado em          : 2026-11-18 16:29:08
# Ultima modificacao : 2026-11-24 10:57:47
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import itertools
import unittest
from decimal import Decimal
from types import SimpleNamespace

import httpx

from app.services.canais.estoque import drenar_fila, enfileirar, quantidade_canal, reservas, sincronizar
from app.services.shopify.cliente import ShopifyErro

P1, P2 = "p1", "p2"
ANTES = "2026-11-18T10:00:00+00:00"
_instantes = (f"2026-11-18T11:00:{s:02d}+00:00" for s in itertools.count())


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

    def upsert(self, payload, on_conflict, ignore_duplicates=False):
        self.op, self.payload, self.conflito, self.ignorar = "upsert", payload, on_conflict, ignore_duplicates
        return self

    def execute(self):
        linhas = self.db.tabelas.setdefault(self.nome, [])
        if self.op == "upsert":
            for item in self.payload:
                achou = next((r for r in linhas if r[self.conflito] == item[self.conflito]), None)
                if achou is None:
                    linhas.append(dict(item))
                elif not self.ignorar:
                    achou.update(item)
            return SimpleNamespace(data=list(self.payload))
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
        self.lease, self.rpcs, self.n = None, [], 0  # lease = token do dono atual

    def table(self, nome):
        return FakeQuery(self, nome)

    def rpc(self, nome, params=None):
        params = params or {}
        self.rpcs.append((nome, params))
        dado = None
        if nome == "pegar_lease_sync":
            dono = params.get("p_dono")
            if dono is None and self.lease is None:
                self.n += 1
                self.lease = dado = f"tok{self.n}"
            elif dono is not None and dono == self.lease:
                dado = dono
        elif nome == "soltar_lease_sync" and params.get("p_dono") == self.lease:
            self.lease = None
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=dado))


class FakeCliente:
    def __init__(self, erro=None, location="gid://loc/1", durante=None, vezes=1):
        self.chamadas, self.erro, self.location_id = [], erro, location
        self.durante, self.vezes = durante, vezes  # roda no meio do envio (mudança concorrente)

    def graphql(self, query, variables=None):
        self.chamadas.append((query, variables))
        if self.durante and self.vezes:
            self.vezes -= 1
            self.durante()
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


def lida(db):
    """A fila como o dreno leu: produto_id -> criado_em."""
    return {r["produto_id"]: r["criado_em"] for r in db.tabelas["canal_sync_fila"]}


def reenfileirar(db, pid):
    """Como o gatilho: upsert com um instante novo (clock_timestamp)."""
    db.table("canal_sync_fila").upsert([{"produto_id": pid, "criado_em": next(_instantes)}], "produto_id").execute()


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
        res = sincronizar(db, cli, lida(db))
        self.assertEqual(res, {"enviados": 3, "erros": []})
        self.assertEqual(len(cli.chamadas), 1)
        qtds = {q["inventoryItemId"]: q["quantity"] for q in cli.chamadas[0][1]["input"]["quantities"]}
        # P1: frasco 1; decant (7+100-5)/5 = 20; P2: 4
        self.assertEqual(qtds, {"gid://item/v1": 1, "gid://item/v2": 20, "gid://item/v3": 4})
        v = {r["id"]: r for r in db.tabelas["canal_vinculos"]}
        self.assertEqual((v["v2"]["ultima_qtd"], v["v2"]["erro"]), (20, None))
        self.assertIsNotNone(v["v2"]["sincronizado_em"])
        self.assertEqual(db.tabelas["canal_sync_fila"], [])

    def test_mutation_2026_10_change_from_null_e_idempotente(self):
        # API 2026-04+: changeFromQuantity obrigatório (null = sem conferência) e @idempotent
        db, cli = montar(), FakeCliente()
        sincronizar(db, cli, lida(db))
        sincronizar(db, cli, lida(montar()))
        (q1, v1), (_, v2) = cli.chamadas
        self.assertIn("@idempotent(key: $idempotencyKey)", q1)
        self.assertIn("$idempotencyKey: String!", q1)
        self.assertNotIn("ignoreCompareQuantity", v1["input"])
        self.assertNotIn("compareQuantity", str(v1["input"]))
        for q in v1["input"]["quantities"]:
            self.assertIn("changeFromQuantity", q)
            self.assertIsNone(q["changeFromQuantity"])
        self.assertTrue(v1["idempotencyKey"])
        self.assertNotEqual(v1["idempotencyKey"], v2["idempotencyKey"])  # uma chave por chamada

    def test_sincronizar_falha_mantem_fila(self):
        db, cli = montar(), FakeCliente(erro=ShopifyErro("boom"))
        res = sincronizar(db, cli, {P1: ANTES})
        self.assertEqual(res["enviados"], 0)
        self.assertEqual(len(res["erros"]), 1)
        self.assertIn("boom", db.tabelas["canal_vinculos"][0]["erro"])
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_erro_de_rede_mantem_fila(self):
        db = montar()
        res = sincronizar(db, FakeCliente(erro=httpx.ConnectError("sem rede")), lida(db))
        self.assertEqual(res["enviados"], 0)
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_sem_location_e_erro(self):
        db = montar()
        res = sincronizar(db, FakeCliente(location=None), lida(db))
        self.assertEqual(res["enviados"], 0)
        self.assertIn("reconecte", db.tabelas["canal_vinculos"][0]["erro"])
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_fila_alterada_durante_sync_nao_e_perdida(self):
        db = montar()
        fila = lida(db)
        db.tabelas["canal_sync_fila"][0]["criado_em"] = "2999-01-01T00:00:00+00:00"
        sincronizar(db, FakeCliente(), fila)
        self.assertEqual([r["produto_id"] for r in db.tabelas["canal_sync_fila"]], [P1])

    def test_reenfileirado_com_instante_anterior_ao_corte_fica(self):
        # transação que reenfileira P1 e só commita depois da leitura: o criado_em novo dela
        # é ANTERIOR ao da linha mais nova lida (P2), mas é outro valor; não pode ser apagada
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P1, "criado_em": "2026-11-18T10:00:00+00:00"},
                                         {"produto_id": P2, "criado_em": "2026-11-18T10:00:05+00:00"}]
        fila = lida(db)
        db.tabelas["canal_sync_fila"][0]["criado_em"] = "2026-11-18T10:00:03+00:00"
        sincronizar(db, FakeCliente(), fila)
        self.assertEqual(db.tabelas["canal_sync_fila"], [{"produto_id": P1, "criado_em": "2026-11-18T10:00:03+00:00"}])

    def test_drenar_fila_sincroniza_so_a_fila(self):
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P2, "criado_em": ANTES}]
        cli = FakeCliente()
        res = drenar_fila(db, cli)
        self.assertEqual(res["enviados"], 1)
        self.assertEqual(db.tabelas["canal_sync_fila"], [])
        self.assertEqual([n for n, _ in db.rpcs], ["pegar_lease_sync", "pegar_lease_sync", "soltar_lease_sync"])
        self.assertEqual(db.rpcs[-1][1], {"p_dono": "tok1"})
        self.assertIsNone(db.lease)

    def test_drenar_ocupado_nao_envia(self):
        db, cli = montar(), FakeCliente()
        db.lease = "outro"  # outro dreno em andamento
        self.assertEqual(drenar_fila(db, cli), {"enviados": 0, "erros": [], "ocupado": True})
        self.assertEqual(cli.chamadas, [])
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)
        self.assertEqual(db.lease, "outro")  # não solta o lease alheio

    def test_drenar_solta_lease_mesmo_com_erro(self):
        db = montar()
        cli = FakeCliente(erro=RuntimeError("inesperado"))
        with self.assertRaises(RuntimeError):
            drenar_fila(db, cli)
        self.assertIsNone(db.lease)

    def test_drenar_repete_quando_entra_mudanca_durante_envio(self):
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P1, "criado_em": ANTES}]
        # durante o envio de P1, um pedido novo reenfileira P1 (criado_em avança)
        cli = FakeCliente(durante=lambda: reenfileirar(db, P1))
        res = drenar_fila(db, cli)
        self.assertEqual(len(cli.chamadas), 2)  # mandou de novo com o estado novo
        self.assertEqual(res["enviados"], 4)
        self.assertEqual(db.tabelas["canal_sync_fila"], [])
        renovou = [p for n, p in db.rpcs if n == "pegar_lease_sync" and p.get("p_dono")]
        self.assertEqual(renovou, [{"p_segundos": 60, "p_dono": "tok1"}] * 2)  # renova a cada volta

    def test_drenar_para_se_perdeu_o_lease(self):
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P1, "criado_em": ANTES}]

        def roubar():  # o lease venceu e outro dreno pegou; e entrou mudança nova
            db.lease = "outro"
            reenfileirar(db, P1)

        cli = FakeCliente(durante=roubar)
        drenar_fila(db, cli)
        self.assertEqual(len(cli.chamadas), 1)  # não envia sem o lease
        self.assertEqual(db.lease, "outro")  # e não solta o lease do outro
        self.assertEqual([r["produto_id"] for r in db.tabelas["canal_sync_fila"]], [P1])

    def test_drenar_tenta_de_novo_se_sobrou_fila_ao_soltar(self):
        # mudança nova a cada envio esgota as 5 voltas; ao soltar o lease ainda há fila
        # (quem avisou recebeu "ocupado"): pega o lease mais uma vez e envia
        db = montar()
        db.tabelas["canal_sync_fila"] = [{"produto_id": P2, "criado_em": ANTES}]
        cli = FakeCliente(durante=lambda: reenfileirar(db, P2), vezes=5)
        drenar_fila(db, cli)
        self.assertEqual(len(cli.chamadas), 6)
        self.assertEqual(db.tabelas["canal_sync_fila"], [])
        self.assertIsNone(db.lease)

    def test_drenar_nao_repete_falha(self):
        db, cli = montar(), FakeCliente(erro=ShopifyErro("boom"))
        res = drenar_fila(db, cli)
        self.assertEqual(len(cli.chamadas), 1)
        self.assertEqual(len(res["erros"]), 1)
        self.assertEqual(len(db.tabelas["canal_sync_fila"]), 2)

    def test_enfileirar_avanca_criado_em(self):
        db = montar()
        enfileirar(db, [P1, "p9"])
        fila = lida(db)
        self.assertGreater(fila[P1], ANTES)
        self.assertEqual(fila[P2], ANTES)
        self.assertIn("p9", fila)

    def test_produto_desligado_sai_da_fila(self):
        db = montar()
        db.tabelas["canal_sync_fila"].append({"produto_id": "p9", "criado_em": ANTES})
        sincronizar(db, FakeCliente(), {P2: ANTES, "p9": ANTES})
        self.assertEqual([r["produto_id"] for r in db.tabelas["canal_sync_fila"]], [P1])

    def test_item_sem_produto_reserva_pela_variante(self):
        # pedido chegou antes do vínculo: produto_id null, mas a variante agora está ligada
        pedidos = [{"status": "a_confirmar", "itens": [
            {"variante_id": "777", "produto_id": None, "tipo": None, "ml": None, "quantidade": 2},
            {"variante_id": "888", "produto_id": None, "tipo": None, "ml": None, "quantidade": 1},
            {"variante_id": "999", "produto_id": None, "tipo": None, "ml": None, "quantidade": 5}]}]
        ligados = {"777": {"produto_id": P1, "tipo": "frasco", "ml": None},
                   "888": {"produto_id": P1, "tipo": "decant", "ml": 5}}
        self.assertEqual(reservas(pedidos, ligados), {P1: (2, Decimal(5))})

    def test_sincronizar_reserva_item_ligado_depois(self):
        db = montar()
        db.tabelas["pedidos_canal"] = [{"status": "a_confirmar", "itens": [
            {"variante_id": "777", "produto_id": None, "tipo": None, "ml": None, "quantidade": 3}]}]
        db.tabelas["canal_vinculos"][2]["externo_variante_id"] = "777"  # v3 → P2
        cli = FakeCliente()
        sincronizar(db, cli, {P2: ANTES})
        [q] = cli.chamadas[0][1]["input"]["quantities"]
        self.assertEqual(q["quantity"], 1)  # 4 em estoque - 3 reservados


if __name__ == "__main__":
    unittest.main()
