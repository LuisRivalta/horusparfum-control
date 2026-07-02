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
Pedido de Venda No 135447
Item Codigo (SKU) / GTIN / NCM Qtd Un Preco un Total
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


ONUN_MIXED_TEXT = """
Onuh Distribuidora LTDA
58.261.257/0001-87
(11) 95447-5312
Pedido de Venda No 134638
Cliente 61.663.867 RINALDO ROMEU FERNANDES JUNIOR
Endereco Rua Zeca Arena, No 91. Bairro: Jardim Bela Vista.
Item Codigo (SKU) /
GTIN / NCM Qtd Un Preco un Total
MAISON ALHAMBRA MAISON MAITRE DE
BLUE EDP 100ML
DB-BLUE2023
6291107459165
NCM: 3303.00.10
1,00 un 139,99 139,99
ARMAF I AM KAYA BODY SPRAY 200ML NCM: 3303.00.10 1,00 un 59,99 59,99
ARMAF I AM ENIGMA BODY SPRAY 200ML NCM: 3303.00.10 1,00 un 59,99 59,99
LATTAFA HAYAATI FLORENCE EDP 100ML DB-flor3180 2,00 un 99,99 199,98
6290360593180
NCM: 3303.00.10
LATTAFA OPULENT DUBAI EDP 100ML DB-LAT1321
6290362341321
NCM: 3303.00.10
1,00 un 119,99 119,99
Numero de itens: 5
Soma das quantidades: 6,00
Total de produtos
4.474,66
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

    def test_parseia_pdf_onun_com_cabecalho_e_linhas_inline(self):
        resultado = parse_pedido_pdf_text(ONUN_MIXED_TEXT)

        self.assertEqual(resultado["avisos"], [])
        self.assertEqual(
            resultado["itens"],
            [
                {
                    "nome": "MAISON ALHAMBRA MAISON MAITRE DE BLUE EDP 100ML",
                    "codigo": "DB-BLUE2023",
                    "qtd": 1.0,
                    "preco_unitario": 139.99,
                    "total": 139.99,
                },
                {
                    "nome": "ARMAF I AM KAYA BODY SPRAY 200ML",
                    "codigo": None,
                    "qtd": 1.0,
                    "preco_unitario": 59.99,
                    "total": 59.99,
                },
                {
                    "nome": "ARMAF I AM ENIGMA BODY SPRAY 200ML",
                    "codigo": None,
                    "qtd": 1.0,
                    "preco_unitario": 59.99,
                    "total": 59.99,
                },
                {
                    "nome": "LATTAFA HAYAATI FLORENCE EDP 100ML",
                    "codigo": "DB-flor3180",
                    "qtd": 2.0,
                    "preco_unitario": 99.99,
                    "total": 199.98,
                },
                {
                    "nome": "LATTAFA OPULENT DUBAI EDP 100ML",
                    "codigo": "DB-LAT1321",
                    "qtd": 1.0,
                    "preco_unitario": 119.99,
                    "total": 119.99,
                },
            ],
        )

    def test_avisa_quando_total_de_itens_diverge_do_declarado(self):
        texto = ONUN_MIXED_TEXT.replace("Numero de itens: 5", "Numero de itens: 6")

        resultado = parse_pedido_pdf_text(texto)

        self.assertEqual(
            resultado["avisos"],
            ["PDF declara 6 itens, mas 5 foram extraídos"],
        )

    def test_falha_quando_nao_encontra_itens(self):
        with self.assertRaises(PedidoPdfParseError) as ctx:
            parse_pedido_pdf_text("Pedido sem tabela de itens")

        self.assertEqual(str(ctx.exception), "Nenhum item encontrado no PDF")


if __name__ == "__main__":
    unittest.main()