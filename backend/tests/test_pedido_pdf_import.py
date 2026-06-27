import sys
import types
import unittest

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.services.pedido_pdf_import import (
    PedidoPdfParseError,
    normalizar_numero_br,
    parse_pedido_pdf_text,
)


ONUN_TEXT = """
Pedido de Venda Nº 135447
Item Código (SKU) / GTIN / NCM Qtd Un Preço un Total
ISABELLE LA BELLE HIDRATANTE
CORPORAL SUPREMACIA 200GR - POTE
DB-SUP597
7898744785597
NCM: 3304.99.10
1,00 un 99,99 99,99
AL RASASI HAWAS BLACK EDP 100ML
DB-AR033
614514331033
NCM: 3303.00.10
1,00 un 189,99 189,99
LATTAFA ASAD BOURBON EDP 100ML
DB-LA340362
6290362340362
NCM: 3303.00.10
4,00 un 169,99 679,96
"""


class PedidoPdfImportTest(unittest.TestCase):
    def test_normaliza_numero_brasileiro(self):
        self.assertEqual(normalizar_numero_br("1,00"), 1.0)
        self.assertEqual(normalizar_numero_br("169,99"), 169.99)
        self.assertEqual(normalizar_numero_br("1.234,56"), 1234.56)

    def test_parseia_itens_do_texto_onun(self):
        resultado = parse_pedido_pdf_text(ONUN_TEXT)

        self.assertEqual(resultado["avisos"], [])
        self.assertEqual(
            resultado["itens"],
            [
                {
                    "nome": "ISABELLE LA BELLE HIDRATANTE CORPORAL SUPREMACIA 200GR - POTE",
                    "codigo": "DB-SUP597",
                    "qtd": 1.0,
                    "preco_unitario": 99.99,
                    "total": 99.99,
                },
                {
                    "nome": "AL RASASI HAWAS BLACK EDP 100ML",
                    "codigo": "DB-AR033",
                    "qtd": 1.0,
                    "preco_unitario": 189.99,
                    "total": 189.99,
                },
                {
                    "nome": "LATTAFA ASAD BOURBON EDP 100ML",
                    "codigo": "DB-LA340362",
                    "qtd": 4.0,
                    "preco_unitario": 169.99,
                    "total": 679.96,
                },
            ],
        )

    def test_falha_quando_nao_encontra_itens(self):
        with self.assertRaises(PedidoPdfParseError) as ctx:
            parse_pedido_pdf_text("Pedido sem tabela de itens")

        self.assertEqual(str(ctx.exception), "Nenhum item encontrado no PDF")


if __name__ == "__main__":
    unittest.main()
