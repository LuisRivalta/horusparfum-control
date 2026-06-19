import unittest

from app.services.financeiro_relatorios import (
    montar_relatorio_financeiro,
    parse_iso_datetime,
)


class RelatorioFinanceiroTest(unittest.TestCase):
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
