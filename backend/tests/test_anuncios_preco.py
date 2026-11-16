# [CLAUDE-CODE-AUDIT]
# ID                 : 20261116-162710-de13
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : test_anuncios_preco.py
# Assunto            : 
# Origem             : solicitacao do usuario
# Motivo             : Teste das taxas compartilhadas entre tipos pedido pela revisao.
# Ultima modificacao : 2026-11-16 16:27:10
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import unittest
from decimal import Decimal as D

from app.services.anuncios.preco import (
    Custos,
    Pacote,
    arredondar_90,
    calcular_preco,
    consulta_ml,
)


def consultar_falso(p: D) -> Custos:
    comissao = (p * D('0.14')).quantize(D('0.01'))
    if p >= 79:
        return Custos(comissao, D('0'), D('20'))
    return Custos(comissao, D('6.50'), D('0'))


def liquido(p: D) -> D:
    c = consultar_falso(p)
    return p - c.comissao - c.taxa_fixa - c.frete


def nenhum_fecha_antes(consultar, p, alvo):
    g = D('8.90')
    while g <= p - 1:
        c = consultar(g)
        assert g - c.comissao - c.taxa_fixa - c.frete < alvo, g
        g += 1


def consultar_taxa_so_abaixo_de_79(p: D) -> Custos:
    comissao = (p * D('0.14')).quantize(D('0.01'))
    return Custos(comissao, D('15') if p < 79 else D('0'), D('0'))


class ClienteFalso:
    ml_user_id = 123

    def __init__(self):
        self.chamadas = []

    def get(self, path, params=None):
        self.chamadas.append(path)
        if 'listing_prices' in path:
            return {'sale_fee_amount': 13.5, 'sale_fee_details': {'fixed_fee': 6.5}}
        return {'coverage': {'all_country': {'list_cost': 20}}}


class PrecoTest(unittest.TestCase):
    def test_arredondar_90(self):
        self.assertEqual(arredondar_90(D('10.00')), D('10.90'))
        self.assertEqual(arredondar_90(D('10.90')), D('10.90'))
        self.assertEqual(arredondar_90(D('10.91')), D('11.90'))

    def test_preco_fecha_margem(self):
        r = calcular_preco(D('25'), D('0.6'), consultar_falso)
        p = r['preco']
        self.assertEqual(p % 1, D('0.90'))
        self.assertGreaterEqual(liquido(p), 40)
        self.assertLess(liquido(p - 1), 40)
        nenhum_fecha_antes(consultar_falso, p, D('40'))
        self.assertEqual(r['lucro'], p - r['comissao'] - r['taxa_fixa'] - r['frete'] - 25)

    def test_preco_minimo_ml(self):
        r = calcular_preco(D('2'), D('0.6'), consultar_falso)
        self.assertGreaterEqual(r['preco'], D('8.90'))
        self.assertGreaterEqual(liquido(r['preco']), D('3.2'))

    def test_cruza_79_sem_pular_faixa(self):
        r = calcular_preco(D('40'), D('0.6'), consultar_falso)
        p = r['preco']
        self.assertGreaterEqual(p, D('79.90'))
        self.assertEqual(p % 1, D('0.90'))
        self.assertGreaterEqual(liquido(p), 64)
        self.assertLess(liquido(p - 1), 64)
        nenhum_fecha_antes(consultar_falso, p, D('64'))

    def test_sonda_79_90_fecha_margem(self):
        # alvo 68: de 68,90 o salto iria a 92,90, mas 79,90 já fecha (taxa fixa some)
        r = calcular_preco(D('40'), D('0.7'), consultar_taxa_so_abaixo_de_79)
        self.assertEqual(r['preco'], D('79.90'))

    def test_tipo_de_anuncio_ausente_na_lista_erro(self):
        class Cli(ClienteFalso):
            def get(self, path, params=None):
                return [{'listing_type_id': 'free', 'sale_fee_amount': 0,
                         'sale_fee_details': {'fixed_fee': 0}}]

        with self.assertRaises(ValueError):
            consulta_ml(Cli(), 'gold_special', Pacote(300, D('10'), D('10'), D('10')))(D('50.90'))

    def test_custo_zero_erro(self):
        with self.assertRaises(ValueError):
            calcular_preco(D('0'), D('0.6'), consultar_falso)

    def test_pacote_sem_medidas_acima_de_79(self):
        consultar = consulta_ml(ClienteFalso(), 'gold_special', Pacote(None, None, None, None))
        with self.assertRaises(ValueError) as e:
            consultar(D('99.90'))
        self.assertIn('kit de envio', str(e.exception))
        self.assertEqual(consultar(D('50.90')).frete, 0)

    def test_consulta_ml_usa_cache(self):
        cli = ClienteFalso()
        consultar = consulta_ml(cli, 'gold_special', Pacote(300, D('10'), D('10'), D('10')))
        consultar(D('50.90'))
        consultar(D('50.90'))
        self.assertEqual(len([c for c in cli.chamadas if 'listing_prices' in c]), 1)
        self.assertEqual(consultar(D('99.90')).frete, D('20'))

    def test_taxas_compartilhadas_entre_tipos(self):
        class Cli(ClienteFalso):
            def get(self, path, params=None):
                self.chamadas.append((path, params))
                return [{'listing_type_id': lt, 'sale_fee_amount': fee, 'sale_fee_details': {'fixed_fee': 6.5}}
                        for lt, fee in (('gold_special', 13.5), ('gold_pro', 20))]

        cli, taxas = Cli(), {}
        pacote = Pacote(300, D('10'), D('10'), D('10'))
        especial = consulta_ml(cli, 'gold_special', pacote, taxas)(D('50.90'))
        pro = consulta_ml(cli, 'gold_pro', pacote, taxas)(D('50.90'))
        self.assertEqual((especial.comissao, pro.comissao), (D('7.0'), D('13.5')))
        self.assertEqual(len(cli.chamadas), 1)
        self.assertNotIn('listing_type_id', cli.chamadas[0][1])


if __name__ == '__main__':
    unittest.main()
