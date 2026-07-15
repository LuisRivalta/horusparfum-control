import unittest

from app.services.financeiro_relatorios import (
    montar_relatorio_financeiro,
    parse_iso_datetime,
)


class RelatorioFinanceiroTest(unittest.TestCase):
    def test_desconta_custo_vendido_do_lucro_sem_alterar_saldo_historico(self):
        transacoes = [
            {"id": "receita-julho", "descricao": "Receitas de julho", "tipo": "entrada", "valor": "761.21", "origem": "venda", "venda_id": "venda-julho", "created_at": "2026-07-15T12:00:00+00:00"},
            {"id": "despesas-julho", "descricao": "Despesas de julho", "tipo": "saida", "valor": "308.85", "origem": "manual", "venda_id": None, "created_at": "2026-07-16T12:00:00+00:00"},
        ]
        vendas = [
            {"id": "venda-julho", "data_venda": "2026-07-10", "status": "concluida", "total_custo": "304.97"},
            {"id": "venda-cancelada", "data_venda": "2026-07-11", "status": "cancelada", "total_custo": "999.99"},
        ]
        relatorio = montar_relatorio_financeiro(
            transacoes, parse_iso_datetime("2026-07-01T00:00:00-03:00"),
            parse_iso_datetime("2026-07-31T23:59:59-03:00"), vendas,
        )
        self.assertEqual(relatorio["resumo"]["receita"], 761.21)
        self.assertEqual(relatorio["resumo"]["despesa"], 308.85)
        self.assertEqual(relatorio["resumo"]["saldo_historico"], 452.36)
        self.assertEqual(relatorio["resumo"]["lucro"], 147.39)

    def test_usa_data_venda_para_transacoes_vinculadas_e_created_at_para_manuais(self):
        transacoes = [
            {"id": "retroativa", "descricao": "Venda retroativa", "tipo": "entrada", "valor": "100.00", "origem": "venda", "venda_id": "venda-retroativa", "created_at": "2026-08-02T12:00:00+00:00"},
            {"id": "manual-agosto", "descricao": "Entrada manual de agosto", "tipo": "entrada", "valor": "50.00", "origem": "manual", "venda_id": None, "created_at": "2026-08-02T12:00:00+00:00"},
        ]
        vendas = [{"id": "venda-retroativa", "data_venda": "2026-07-31", "status": "concluida", "total_custo": "40.00"}]
        relatorio = montar_relatorio_financeiro(
            transacoes, parse_iso_datetime("2026-07-01T00:00:00-03:00"),
            parse_iso_datetime("2026-07-31T23:59:59-03:00"), vendas,
        )
        self.assertEqual(relatorio["resumo"]["receita"], 100.00)
        self.assertEqual(relatorio["resumo"]["lucro"], 60.00)
        self.assertEqual(relatorio["resumo"]["saldo_historico"], 100.00)
        self.assertEqual([t["descricao"] for t in relatorio["transacoes"]], ["Venda retroativa"])
    def test_monta_relatorio_por_periodo_com_decimal_e_saldo_historico(self):
        transacoes = [
            {
                "id": "1",
                "descricao": "Venda balcao",
                "tipo": "entrada",
                "valor": "500.10",
                "categoria": "Vendas",
                "forma_pagamento": "Pix",
                "responsavel": "Luis",
                "origem": "venda",
                "created_at": "2026-06-10T12:00:00+00:00",
            },
            {
                "id": "2",
                "descricao": "Compra fornecedor",
                "tipo": "saida",
                "valor": "200.05",
                "categoria": "Fornecedores",
                "forma_pagamento": "Boleto",
                "responsavel": "Luis",
                "origem": "manual",
                "created_at": "2026-06-12T12:00:00+00:00",
            },
            {
                "id": "3",
                "descricao": "Trafego pago",
                "tipo": "saida",
                "valor": "75.05",
                "categoria": "Marketing",
                "forma_pagamento": "Cartao",
                "responsavel": "Luis",
                "origem": "manual",
                "created_at": "2026-06-13T12:00:00+00:00",
            },
            {
                "id": "4",
                "descricao": "Venda anterior",
                "tipo": "entrada",
                "valor": "1000.00",
                "categoria": "Vendas",
                "forma_pagamento": "Pix",
                "responsavel": "Luis",
                "origem": "manual",
                "created_at": "2026-05-10T12:00:00+00:00",
            },
            {
                "id": "5",
                "descricao": "Venda futura",
                "tipo": "entrada",
                "valor": "999.00",
                "categoria": "Vendas",
                "forma_pagamento": "Pix",
                "responsavel": "Luis",
                "origem": "manual",
                "created_at": "2026-07-10T12:00:00+00:00",
            },
        ]

        relatorio = montar_relatorio_financeiro(
            transacoes,
            parse_iso_datetime("2026-06-01T00:00:00Z"),
            parse_iso_datetime("2026-06-30T23:59:59Z"),
        )

        self.assertEqual(relatorio["resumo"]["receita"], 500.10)
        self.assertEqual(relatorio["resumo"]["despesa"], 275.10)
        self.assertEqual(relatorio["resumo"]["lucro"], 225.00)
        self.assertEqual(relatorio["resumo"]["saldo_historico"], 1225.00)
        self.assertEqual(relatorio["total_lancamentos"], 3)
        self.assertEqual(relatorio["categorias"]["receitas"], [{"categoria": "Vendas", "total": 500.10}])
        self.assertEqual(relatorio["categorias"]["despesas"][0], {"categoria": "Fornecedores", "total": 200.05})
        self.assertEqual(relatorio["origens"], [{"origem": "Manual", "qtd": 2}, {"origem": "Venda", "qtd": 1}])
        self.assertEqual(relatorio["maiores"]["receitas"][0]["descricao"], "Venda balcao")
        self.assertNotIn("Venda anterior", [t["descricao"] for t in relatorio["transacoes"]])
        self.assertNotIn("Venda futura", [t["descricao"] for t in relatorio["transacoes"]])


if __name__ == "__main__":
    unittest.main()
