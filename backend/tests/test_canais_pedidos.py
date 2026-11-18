# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-162633-442d
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Canais: test_canais_pedidos.py
# Assunto            : Testes da normalizacao e ingestao de pedidos
# Origem             : solicitacao do usuario
# Motivo             : Cobrir por teste a corrida de confirmacao, avisos concorrentes, total original e fuso
# Criado em          : 2026-11-18 16:22:28
# Ultima modificacao : 2026-11-18 16:26:33
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.canais.pedidos import (
    ingerir,
    normalizar_graphql,
    normalizar_webhook,
    proximo_status,
)

CONECTADO = datetime(2026, 11, 18, 12, 0, tzinfo=timezone.utc)


class FakeQuery:
    def __init__(self, db, nome):
        self.db, self.nome = db, nome
        self.op, self.payload, self.filtros, self.conflito = "select", None, [], None

    def select(self, *_):
        return self

    def upsert(self, payload, on_conflict, ignore_duplicates=False):
        self.op, self.payload, self.conflito = "upsert", payload, on_conflict.split(",")
        self.ignorar = ignore_duplicates
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def eq(self, campo, valor):
        self.filtros.append(lambda r: r.get(campo) == valor)
        return self

    def execute(self):
        if self.op != "select" and self.db.antes_de_gravar:
            gancho, self.db.antes_de_gravar = self.db.antes_de_gravar, None
            gancho()
        linhas = self.db.tabelas.setdefault(self.nome, [])
        if self.op == "upsert":
            chave = [self.payload[c] for c in self.conflito]
            for r in linhas:
                if [r.get(c) for c in self.conflito] == chave:
                    if self.ignorar:
                        return SimpleNamespace(data=[])
                    r.update(self.payload)
                    return SimpleNamespace(data=[dict(r)])
            linhas.append(dict(self.payload))
            return SimpleNamespace(data=[dict(self.payload)])
        alvo = [r for r in linhas if all(f(r) for f in self.filtros)]
        if self.op == "update":
            for r in alvo:
                r.update(self.payload)
        return SimpleNamespace(data=[dict(r) for r in alvo])


class FakeDb:
    def __init__(self, **tabelas):
        self.tabelas = tabelas
        self.antes_de_gravar = None  # roda uma vez, entre a leitura e a gravação

    def table(self, nome):
        return FakeQuery(self, nome)


def webhook(**extra):
    p = {
        "id": 5001,
        "name": "#1001",
        "created_at": "2026-11-18T10:30:00-03:00",
        "financial_status": "paid",
        "cancelled_at": None,
        "customer": {"first_name": "Ana", "last_name": "Silva"},
        "total_price": "195.00",
        "shipping_lines": [{"price": "15.00"}],
        "refunds": [],
        "line_items": [
            {
                "variant_id": 777,
                "title": "Perfume X",
                "variant_title": "Decant 5ml",
                "quantity": 2,
                "price": "100.00",
                "discount_allocations": [{"amount": "20.00"}],
            }
        ],
    }
    p.update(extra)
    return p


def dinheiro(v):
    return {"shopMoney": {"amount": v}}


def graphql():
    return {
        "legacyResourceId": "5001",
        "name": "#1001",
        "createdAt": "2026-11-18T13:30:00Z",
        "displayFinancialStatus": "PAID",
        "cancelledAt": None,
        "customer": {"displayName": "Ana Silva"},
        "totalPriceSet": dinheiro("195.0"),
        "currentTotalPriceSet": dinheiro("195.0"),
        "totalShippingPriceSet": dinheiro("15.0"),
        "totalRefundedSet": dinheiro("0.0"),
        "lineItems": {
            "nodes": [
                {
                    "variant": {"legacyResourceId": "777"},
                    "title": "Perfume X",
                    "variantTitle": "Decant 5ml",
                    "quantity": 2,
                    "discountedUnitPriceAfterAllDiscountsSet": dinheiro("90.0"),
                }
            ]
        },
    }


def norm(pagamento="pago", cancelado=False, reembolsado="0"):
    p = normalizar_webhook(webhook())
    p["pagamento"], p["cancelado"], p["reembolsado"] = pagamento, cancelado, Decimal(reembolsado)
    return p


VINCULO = {"canal": "shopify", "externo_variante_id": "777", "produto_id": "prod-1", "tipo": "decant", "ml": 5}


class NormalizarTest(unittest.TestCase):
    def test_normalizar_webhook_desconto(self):
        p = normalizar_webhook(webhook())
        self.assertEqual(p["itens"][0]["preco_unitario"], Decimal("90.00"))
        self.assertEqual(p["itens"][0]["titulo"], "Perfume X — Decant 5ml")
        self.assertEqual(p["externo_id"], "5001")
        self.assertEqual(p["cliente"], "Ana Silva")
        self.assertEqual(p["frete"], Decimal("15.00"))

    def test_normalizar_graphql_equivale_webhook(self):
        self.assertEqual(normalizar_graphql(graphql()), normalizar_webhook(webhook()))

    def test_total_original_nas_duas_formas(self):
        n = graphql()
        n["currentTotalPriceSet"] = dinheiro("180.0")  # depois de reembolso de 15
        n["totalRefundedSet"] = dinheiro("15.0")
        w = webhook(current_total_price="180.00",
                    refunds=[{"transactions": [{"amount": "15.00"}]}])
        self.assertEqual(normalizar_graphql(n)["total"], Decimal("195.00"))
        self.assertEqual(normalizar_webhook(w)["total"], Decimal("195.00"))
        self.assertEqual(normalizar_graphql(n), normalizar_webhook(w))

    def test_webhook_reembolso_e_cancelamento(self):
        p = normalizar_webhook(webhook(
            financial_status="partially_refunded",
            cancelled_at="2026-11-18T11:00:00-03:00",
            refunds=[{"transactions": [{"amount": "10.50"}, {"amount": "4.50"}]}],
        ))
        self.assertEqual(p["pagamento"], "reembolso_parcial")
        self.assertTrue(p["cancelado"])
        self.assertEqual(p["reembolsado"], Decimal("15.00"))


class ProximoStatusTest(unittest.TestCase):
    def test_proximo_status_novo_cancelado_anulado_reembolsado(self):
        for atual in (None, "aguardando_pagamento", "a_confirmar"):
            self.assertEqual(proximo_status(atual, norm(cancelado=True)), ("cancelado", None))
            self.assertEqual(proximo_status(atual, norm("anulado")), ("cancelado", None))
            self.assertEqual(proximo_status(atual, norm("reembolsado")), ("cancelado", None))

    def test_proximo_status_novo_pendente(self):
        self.assertEqual(proximo_status(None, norm("pendente")), ("aguardando_pagamento", None))
        self.assertEqual(proximo_status("aguardando_pagamento", norm("pendente")), ("aguardando_pagamento", None))

    def test_proximo_status_novo_pago(self):
        for atual in (None, "aguardando_pagamento", "a_confirmar"):
            self.assertEqual(proximo_status(atual, norm("pago")), ("a_confirmar", None))

    def test_proximo_status_a_confirmar_pendente_nao_regride(self):
        self.assertEqual(proximo_status("a_confirmar", norm("pendente")), ("a_confirmar", None))

    def test_proximo_status_confirmado_cancelado(self):
        esperado = ("cancelado_pos_confirmacao", "Cancelado na Shopify — desfazer venda?")
        self.assertEqual(proximo_status("confirmado", norm(cancelado=True)), esperado)
        self.assertEqual(proximo_status("confirmado", norm("reembolsado")), esperado)

    def test_proximo_status_confirmado_reembolso_parcial(self):
        self.assertEqual(
            proximo_status("confirmado", norm("reembolso_parcial", reembolsado="1234.5")),
            ("confirmado", "Reembolso parcial de R$ 1.234,50 na Shopify"),
        )

    def test_proximo_status_confirmado_outro(self):
        self.assertEqual(proximo_status("confirmado", norm("pago")), ("confirmado", None))

    def test_proximo_status_cancelado_sem_mudanca(self):
        for atual in ("cancelado", "cancelado_pos_confirmacao"):
            self.assertEqual(proximo_status(atual, norm("pago")), (atual, None))
            self.assertEqual(proximo_status(atual, norm("pendente")), (atual, None))


class IngerirTest(unittest.TestCase):
    def test_ingerir_idempotente(self):
        db = FakeDb(canal_vinculos=[VINCULO])
        self.assertEqual(ingerir(db, "shopify", norm(), CONECTADO), ["prod-1"])
        ingerir(db, "shopify", norm(), CONECTADO)
        linhas = db.tabelas["pedidos_canal"]
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]["status"], "a_confirmar")
        self.assertEqual(linhas[0]["total"], 195.0)
        self.assertEqual(linhas[0]["itens"][0]["preco_unitario"], 90.0)
        self.assertEqual(linhas[0]["itens"][0]["tipo"], "decant")

    def test_updated_antes_do_create(self):
        db = FakeDb(canal_vinculos=[VINCULO])
        ingerir(db, "shopify", norm("pago"), CONECTADO)
        ingerir(db, "shopify", norm("pendente"), CONECTADO)
        self.assertEqual(db.tabelas["pedidos_canal"][0]["status"], "a_confirmar")

    def test_item_sem_vinculo_entra(self):
        db = FakeDb(canal_vinculos=[])
        self.assertEqual(ingerir(db, "shopify", norm(), CONECTADO), [])
        item = db.tabelas["pedidos_canal"][0]["itens"][0]
        self.assertEqual((item["produto_id"], item["tipo"], item["ml"]), (None, None, None))

    def test_ignora_anterior_a_conexao(self):
        db = FakeDb(canal_vinculos=[VINCULO])
        depois = datetime(2026, 11, 18, 14, 0, tzinfo=timezone.utc)
        self.assertEqual(ingerir(db, "shopify", norm(), depois), [])
        self.assertEqual(ingerir(db, "shopify", norm(), None), [])
        self.assertNotIn("pedidos_canal", db.tabelas)

    def test_confirmado_nao_troca_itens(self):
        antigos = [{"variante_id": "1", "titulo": "Antigo", "quantidade": 1, "preco_unitario": 50.0,
                    "produto_id": "prod-0", "tipo": "frasco", "ml": None}]
        db = FakeDb(canal_vinculos=[VINCULO], pedidos_canal=[
            {"canal": "shopify", "externo_id": "5001", "status": "confirmado", "itens": antigos, "alerta": "x"}
        ])
        afetados = ingerir(db, "shopify", norm("pago"), CONECTADO)
        linha = db.tabelas["pedidos_canal"][0]
        self.assertEqual(linha["itens"], antigos)
        self.assertEqual(linha["status"], "confirmado")
        self.assertEqual(linha["alerta"], "x")
        self.assertEqual(afetados, ["prod-0"])

    def test_troca_itens_retorna_antigos_e_novos(self):
        antigos = [{"variante_id": "1", "titulo": "Antigo", "quantidade": 1, "preco_unitario": 50.0,
                    "produto_id": "prod-0", "tipo": "frasco", "ml": None}]
        db = FakeDb(canal_vinculos=[VINCULO], pedidos_canal=[
            {"canal": "shopify", "externo_id": "5001", "status": "a_confirmar", "itens": antigos, "alerta": None}
        ])
        self.assertEqual(sorted(ingerir(db, "shopify", norm(), CONECTADO)), ["prod-0", "prod-1"])

    def test_corrida_confirmado_entre_leitura_e_gravacao(self):
        antigos = [{"variante_id": "1", "titulo": "Antigo", "quantidade": 1, "preco_unitario": 50.0,
                    "produto_id": "prod-0", "tipo": "frasco", "ml": None}]
        linha = {"canal": "shopify", "externo_id": "5001", "status": "a_confirmar",
                 "itens": antigos, "alerta": None}
        db = FakeDb(canal_vinculos=[VINCULO], pedidos_canal=[linha])
        db.antes_de_gravar = lambda: linha.update(status="confirmado", venda_id="venda-1")
        ingerir(db, "shopify", norm("pago"), CONECTADO)
        self.assertEqual(linha["status"], "confirmado")
        self.assertEqual(linha["itens"], antigos)
        self.assertEqual(linha["venda_id"], "venda-1")

    def test_dois_primeiros_avisos_concorrentes(self):
        db = FakeDb(canal_vinculos=[VINCULO])
        # o "pendente" lê vazio; antes de ele inserir, o "pago" insere primeiro
        db.antes_de_gravar = lambda: ingerir(db, "shopify", norm("pago"), CONECTADO)
        ingerir(db, "shopify", norm("pendente"), CONECTADO)
        linhas = db.tabelas["pedidos_canal"]
        self.assertEqual(len(linhas), 1)
        self.assertEqual(linhas[0]["status"], "a_confirmar")

    def test_linha_sempre_mudando_levanta_erro(self):
        linha = {"canal": "shopify", "externo_id": "5001", "status": "a_confirmar", "itens": [], "alerta": None}
        db = FakeDb(canal_vinculos=[VINCULO], pedidos_canal=[linha])
        estados = iter(["aguardando_pagamento", "a_confirmar", "aguardando_pagamento"])

        def mexer():
            linha["status"] = next(estados)
            db.antes_de_gravar = mexer  # muda a linha antes de toda gravação

        db.antes_de_gravar = mexer
        with self.assertRaises(RuntimeError):
            ingerir(db, "shopify", norm("pago"), CONECTADO)

    def test_conectado_em_sem_fuso_conta_como_utc(self):
        db = FakeDb(canal_vinculos=[VINCULO])
        self.assertEqual(ingerir(db, "shopify", norm(), datetime(2026, 11, 18, 14, 0)), [])
        self.assertEqual(ingerir(db, "shopify", norm(), datetime(2026, 11, 18, 12, 0)), ["prod-1"])


if __name__ == "__main__":
    unittest.main()
