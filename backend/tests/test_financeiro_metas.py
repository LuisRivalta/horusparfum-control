import unittest
from datetime import datetime, timezone

from app.services.financeiro_metas import montar_metas_financeiras


class MetasFinanceirasTest(unittest.TestCase):
    def test_meta_em_reais_usa_receita_do_periodo(self):
        metas = [
            {
                "id": "m1",
                "label": "Faturamento mensal",
                "valor_atual": "0",
                "valor_alvo": "10000",
                "sufixo": "",
                "periodo": "2026-06",
                "created_at": "2026-06-01T00:00:00+00:00",
            }
        ]
        transacoes = [
            {"tipo": "entrada", "valor": "2500", "created_at": "2026-06-10T12:00:00+00:00"},
            {"tipo": "entrada", "valor": "1500", "created_at": "2026-06-11T12:00:00+00:00"},
            {"tipo": "saida", "valor": "999", "created_at": "2026-06-12T12:00:00+00:00"},
            {"tipo": "entrada", "valor": "3000", "created_at": "2026-07-01T12:00:00+00:00"},
        ]

        resultado = montar_metas_financeiras(
            metas,
            transacoes,
            referencia=datetime(2026, 6, 19, tzinfo=timezone.utc),
        )

        self.assertEqual(resultado[0]["valor_atual"], 4000.0)
        self.assertEqual(resultado[0]["valor_manual"], 0.0)
        self.assertEqual(resultado[0]["progresso"], 40.0)
        self.assertEqual(resultado[0]["fonte"], "receita")

    def test_meta_percentual_permanece_manual(self):
        metas = [
            {
                "id": "m2",
                "label": "Margem",
                "valor_atual": "15",
                "valor_alvo": "30",
                "sufixo": "%",
                "periodo": None,
                "created_at": "2026-06-01T00:00:00+00:00",
            }
        ]

        resultado = montar_metas_financeiras(metas, [], referencia=datetime(2026, 6, 19, tzinfo=timezone.utc))

        self.assertEqual(resultado[0]["valor_atual"], 15.0)
        self.assertEqual(resultado[0]["progresso"], 50.0)
        self.assertEqual(resultado[0]["fonte"], "manual")


if __name__ == "__main__":
    unittest.main()
