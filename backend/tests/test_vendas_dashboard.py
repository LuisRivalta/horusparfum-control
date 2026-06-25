import unittest
from datetime import datetime, timezone

from app.services.financeiro_relatorios import parse_iso_datetime
from app.services.vendas_dashboard import montar_dashboard_vendas


class VendasDashboardServiceTest(unittest.TestCase):
    def test_monta_resumo_rankings_e_tabela_ignorando_canceladas(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "240.00",
                "total_custo": "132.00",
                "lucro_bruto": "78.00",
                "taxa_total": "24.00",
                "frete": "6.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            },
            {
                "id": "v2",
                "numero": 11,
                "status": "concluida",
                "data_venda": "2026-06-11",
                "total_bruto": "110.00",
                "total_custo": "58.00",
                "lucro_bruto": "37.00",
                "taxa_total": "10.00",
                "frete": "5.00",
                "canal_id": "c2",
                "created_at": "2026-06-11T12:00:00+00:00",
            },
            {
                "id": "v3",
                "numero": 12,
                "status": "cancelada",
                "data_venda": "2026-06-12",
                "total_bruto": "999.00",
                "total_custo": "100.00",
                "lucro_bruto": "899.00",
                "taxa_total": "0.00",
                "frete": "0.00",
                "canal_id": "c1",
                "created_at": "2026-06-12T12:00:00+00:00",
            },
        ]
        itens = [
            {
                "id": "i1",
                "venda_id": "v1",
                "tipo": "produto",
                "produto_id": "p1",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "200.00",
                "custo_unitario": "120.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "20.00",
                "frete_rateado": "5.00",
                "lucro": "55.00",
            },
            {
                "id": "i2",
                "venda_id": "v1",
                "tipo": "decant",
                "produto_id": "p2",
                "quantidade": 1,
                "ml": 5,
                "preco_unitario": "40.00",
                "custo_unitario": "10.00",
                "custo_embalagem": "2.00",
                "taxa_rateada": "4.00",
                "frete_rateado": "1.00",
                "lucro": "23.00",
            },
            {
                "id": "i3",
                "venda_id": "v2",
                "tipo": "produto",
                "produto_id": "p1",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "110.00",
                "custo_unitario": "58.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "10.00",
                "frete_rateado": "5.00",
                "lucro": "37.00",
            },
            {
                "id": "i4",
                "venda_id": "v3",
                "tipo": "produto",
                "produto_id": "p3",
                "quantidade": 1,
                "ml": None,
                "preco_unitario": "999.00",
                "custo_unitario": "100.00",
                "custo_embalagem": "0.00",
                "taxa_rateada": "0.00",
                "frete_rateado": "0.00",
                "lucro": "899.00",
            },
        ]
        canais = [
            {"id": "c1", "nome": "Shopee"},
            {"id": "c2", "nome": "Loja fisica"},
        ]
        produtos = [
            {"id": "p1", "nome": "Asad Lattafa"},
            {"id": "p2", "nome": "Decant Badee"},
            {"id": "p3", "nome": "Cancelado"},
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            itens,
            canais,
            produtos,
            parse_iso_datetime("2026-06-01T00:00:00Z"),
            parse_iso_datetime("2026-06-30T23:59:59Z"),
        )

        self.assertEqual(dashboard["resumo"]["qtd_vendas"], 2)
        self.assertEqual(dashboard["resumo"]["itens_vendidos"], 3)
        self.assertEqual(dashboard["resumo"]["faturamento_bruto"], 350.0)
        self.assertEqual(dashboard["resumo"]["total_custo"], 190.0)
        self.assertEqual(dashboard["resumo"]["lucro_bruto"], 115.0)
        self.assertEqual(dashboard["resumo"]["margem_media"], 32.86)
        self.assertEqual(dashboard["resumo"]["roi_medio"], 60.53)
        self.assertEqual(dashboard["resumo"]["ticket_medio"], 175.0)
        self.assertEqual(dashboard["produtos"][0]["nome"], "Asad Lattafa")
        self.assertEqual(dashboard["produtos"][0]["quantidade"], 2)
        self.assertEqual(dashboard["produtos"][0]["lucro_bruto"], 92.0)
        self.assertEqual(dashboard["canais"][0]["nome"], "Shopee")
        self.assertEqual(dashboard["canais"][0]["qtd_vendas"], 1)
        self.assertEqual([v["numero"] for v in dashboard["vendas"]], [11, 10])
        self.assertNotIn("Cancelado", [p["nome"] for p in dashboard["produtos"]])

    def test_evolucao_preenche_meses_sem_vendas_com_zero(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "240.00",
                "total_custo": "132.00",
                "lucro_bruto": "78.00",
                "taxa_total": "24.00",
                "frete": "6.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            }
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            [],
            [{"id": "c1", "nome": "Shopee"}],
            [],
            parse_iso_datetime("2026-06-01T00:00:00Z"),
            parse_iso_datetime("2026-08-31T23:59:59Z"),
        )

        self.assertEqual(
            dashboard["evolucao"],
            [
                {"periodo": "2026-06", "label": "Jun/26", "faturamento_bruto": 240.0, "lucro_bruto": 78.0},
                {"periodo": "2026-07", "label": "Jul/26", "faturamento_bruto": 0.0, "lucro_bruto": 0.0},
                {"periodo": "2026-08", "label": "Ago/26", "faturamento_bruto": 0.0, "lucro_bruto": 0.0},
            ],
        )

    def test_roi_fica_nulo_quando_custo_total_e_zero(self):
        vendas = [
            {
                "id": "v1",
                "numero": 10,
                "status": "concluida",
                "data_venda": "2026-06-10",
                "total_bruto": "100.00",
                "total_custo": "0.00",
                "lucro_bruto": "100.00",
                "taxa_total": "0.00",
                "frete": "0.00",
                "canal_id": "c1",
                "created_at": "2026-06-10T12:00:00+00:00",
            }
        ]

        dashboard = montar_dashboard_vendas(
            vendas,
            [],
            [{"id": "c1", "nome": "Loja fisica"}],
            [],
            datetime(2026, 6, 1, tzinfo=timezone.utc),
            datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc),
        )

        self.assertIsNone(dashboard["resumo"]["roi_medio"])
        self.assertIsNone(dashboard["canais"][0]["roi"])


if __name__ == "__main__":
    unittest.main()
