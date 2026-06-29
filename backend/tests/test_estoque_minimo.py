import sys
import types
import unittest

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.services.estoque_minimo import sugerir_estoque_minimo


class EstoqueMinimoServiceTest(unittest.TestCase):
    def test_calcula_sugestao_arredondando_para_cima(self):
        result = sugerir_estoque_minimo(
            produto_id="p1",
            unidades_vendidas=12,
            periodo_dias=90,
            dias_reposicao=15,
            margem_seguranca=0.3,
        )

        self.assertEqual(result["produto_id"], "p1")
        self.assertEqual(result["periodo_dias"], 90)
        self.assertEqual(result["unidades_vendidas"], 12)
        self.assertEqual(result["media_diaria"], 0.13)
        self.assertEqual(result["dias_reposicao"], 15)
        self.assertEqual(result["margem_seguranca"], 0.3)
        self.assertEqual(result["estoque_minimo_sugerido"], 3)
        self.assertTrue(result["tem_dados"])

    def test_retorna_minimo_um_quando_houve_venda_baixa(self):
        result = sugerir_estoque_minimo("p1", unidades_vendidas=1)

        self.assertEqual(result["estoque_minimo_sugerido"], 1)
        self.assertTrue(result["tem_dados"])

    def test_retorna_sem_dados_quando_nao_ha_vendas(self):
        result = sugerir_estoque_minimo("p1", unidades_vendidas=0)

        self.assertEqual(result["unidades_vendidas"], 0)
        self.assertEqual(result["media_diaria"], 0)
        self.assertIsNone(result["estoque_minimo_sugerido"])
        self.assertFalse(result["tem_dados"])

    def test_rejeita_periodo_dias_invalido(self):
        with self.assertRaises(ValueError):
            sugerir_estoque_minimo("p1", unidades_vendidas=1, periodo_dias=0)


if __name__ == "__main__":
    unittest.main()
