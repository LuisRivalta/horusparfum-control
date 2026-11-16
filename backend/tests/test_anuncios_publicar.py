# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-162846-e39a
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Anuncios: test_anuncios_publicar.py
# Assunto            : Modulo/teste do backend do modulo Anuncios (Mercado Livre) do Horus Parfum Control
# Origem             : solicitacao do usuario
# Motivo             : Implementar a Parte 2 do plano de Anuncios pedida pelo Luis
# Criado em          : 2026-11-16 15:24:25
# Ultima modificacao : 2026-11-16 16:27:09
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import unittest
from decimal import Decimal

from app.services.anuncios.preco import Pacote
from app.services.anuncios.publicar import montar_item, quantidade_disponivel

PACOTE = Pacote(peso_g=120, altura_cm=Decimal('5.0'), largura_cm=Decimal('10.0'), comprimento_cm=Decimal('15.5'))
PRODUTO = {
    'id': 'p1', 'nome': 'Asad', 'marca': 'Lattafa', 'volume_ml': 100, 'estoque_atual': 2,
    'gtin': '6291108735411',
    'ficha': {'GENDER': {'value_id': '339666', 'value_name': 'Masculino'}},
}


def atributos(item):
    return {a['id']: a for a in item['attributes']}


class MontarItemTest(unittest.TestCase):
    def test_montar_item_decant_user_product(self):
        anuncio = {'tipo': 'decant', 'ml': 5, 'preco': 39.9, 'titulo': 'Decant Lattafa Asad 5ml',
                   'listing_type': 'gold_special', 'fotos': ['https://f/1.jpg', 'https://f/2.jpg']}
        item = montar_item(anuncio, PRODUTO, True, 7, PACOTE)
        self.assertEqual(item['family_name'], 'Decant Lattafa Asad 5ml')
        self.assertNotIn('title', item)
        a = atributos(item)
        self.assertEqual(a['EMPTY_GTIN_REASON']['value_id'], '17055160')
        self.assertNotIn('GTIN', a)
        self.assertEqual(a['UNIT_VOLUME']['value_name'], '5 mL')
        self.assertEqual(a['BRAND']['value_name'], 'Lattafa')
        self.assertEqual(a['PERFUME_NAME']['value_name'], 'Asad')
        self.assertEqual(a['GENDER'], {'id': 'GENDER', 'value_id': '339666'})
        self.assertEqual(a['SELLER_PACKAGE_WEIGHT']['value_name'], '120')
        self.assertEqual(a['SELLER_PACKAGE_LENGTH']['value_name'], '15.5')
        self.assertEqual(a['SELLER_PACKAGE_HEIGHT']['value_name'], '5')
        self.assertEqual(item['available_quantity'], 7)
        self.assertEqual(item['listing_type_id'], 'gold_special')
        self.assertEqual(item['category_id'], 'MLB6284')
        self.assertEqual(item['pictures'], [{'source': 'https://f/1.jpg'}, {'source': 'https://f/2.jpg'}])
        self.assertEqual(item['shipping'], {'mode': 'me2', 'free_shipping': False})

    def test_montar_item_frasco_com_gtin_sem_user_product(self):
        anuncio = {'tipo': 'frasco', 'ml': None, 'preco': 199.9, 'titulo': 'Perfume Lattafa Asad 100ml',
                   'listing_type': 'gold_pro', 'fotos': ['https://f/1.jpg']}
        item = montar_item(anuncio, PRODUTO, False, 2, PACOTE)
        self.assertEqual(item['title'], 'Perfume Lattafa Asad 100ml')
        self.assertNotIn('family_name', item)
        a = atributos(item)
        self.assertEqual(a['GTIN']['value_name'], '6291108735411')
        self.assertNotIn('EMPTY_GTIN_REASON', a)
        self.assertEqual(a['UNIT_VOLUME']['value_name'], '100 mL')
        self.assertTrue(item['shipping']['free_shipping'])
        self.assertEqual(item['price'], 199.9)

    def test_decant_meio_ml_e_ficha_com_gtin_nao_vaza(self):
        produto = {**PRODUTO, 'ficha': {'GTIN': {'value_id': None, 'value_name': '123'}}}
        item = montar_item({'tipo': 'decant', 'ml': Decimal('2.5'), 'preco': 19.9, 'titulo': 't',
                            'listing_type': 'gold_special', 'fotos': []}, produto, True, 1, PACOTE)
        a = atributos(item)
        self.assertNotIn('GTIN', a)
        self.assertEqual(a['UNIT_VOLUME']['value_name'], '2.5 mL')

    def test_frasco_sem_gtin_leva_motivo(self):
        produto = {**PRODUTO, 'gtin': None}
        item = montar_item({'tipo': 'frasco', 'ml': None, 'preco': 199.9, 'titulo': 't',
                            'listing_type': 'gold_special', 'fotos': []}, produto, False, 1, PACOTE)
        a = atributos(item)
        self.assertNotIn('GTIN', a)
        self.assertEqual(a['EMPTY_GTIN_REASON'], {'id': 'EMPTY_GTIN_REASON', 'value_id': '17055160'})


class QuantidadeTest(unittest.TestCase):
    def test_quantidade_disponivel(self):
        p = lambda estoque: {'estoque_atual': estoque, 'volume_ml': 100}
        self.assertEqual(quantidade_disponivel(p(0), 5, 'decant', 10), 0)
        self.assertEqual(quantidade_disponivel(p(0), 5, 'decant', 5), 1)
        self.assertEqual(quantidade_disponivel(p(1), 5, 'decant', 10), 10)
        self.assertEqual(quantidade_disponivel(p(-3), 5, 'frasco', None), 0)
        self.assertEqual(quantidade_disponivel(p(4), 50, 'frasco', None), 4)
        self.assertEqual(quantidade_disponivel({'estoque_atual': 1, 'volume_ml': None}, 5, 'decant', 2.5), 2)


if __name__ == '__main__':
    unittest.main()
