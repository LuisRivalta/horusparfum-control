import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable

from app.services.mercadolivre import MLCliente

FRETE_GRATIS_A_PARTIR = Decimal('79')
PRECO_MINIMO = Decimal('8.90')
CENT = Decimal('0.01')


@dataclass
class Custos:
    comissao: Decimal
    taxa_fixa: Decimal
    frete: Decimal


@dataclass
class Pacote:
    peso_g: int | None
    altura_cm: Decimal | None
    largura_cm: Decimal | None
    comprimento_cm: Decimal | None


def arredondar_90(v: Decimal) -> Decimal:
    """Menor valor terminado em ,90 que seja >= v."""
    return Decimal(math.ceil(v - Decimal('0.90'))) + Decimal('0.90')


def calcular_preco(custo: Decimal, margem: Decimal,
                   consultar: Callable[[Decimal], Custos]) -> dict:
    if custo <= 0:
        raise ValueError('Custo deve ser maior que zero')
    alvo = custo * (1 + margem)
    p = max(arredondar_90(alvo), PRECO_MINIMO)
    # ponytail: busca por saltos do déficit, não varre centavo a centavo; o ponto 79,90 é o único degrau testado à parte
    for _ in range(60):
        c = consultar(p)
        liq = p - c.comissao - c.taxa_fixa - c.frete
        if liq >= alvo:
            return {
                'preco': p.quantize(CENT),
                'comissao': c.comissao.quantize(CENT),
                'taxa_fixa': c.taxa_fixa.quantize(CENT),
                'frete': c.frete.quantize(CENT),
                'lucro': (liq - custo).quantize(CENT),
            }
        prox = arredondar_90(p + (alvo - liq))
        ponto = Decimal('79.90')
        p = ponto if p < ponto < prox else prox
    raise RuntimeError('Não foi possível achar um preço que feche a margem')


def consulta_ml(cliente: MLCliente, listing_type: str,
                pacote: Pacote) -> Callable[[Decimal], Custos]:
    cache: dict[Decimal, Custos] = {}

    def consultar(p: Decimal) -> Custos:
        if p in cache:
            return cache[p]
        frete = Decimal('0')
        if p >= FRETE_GRATIS_A_PARTIR:
            if None in (pacote.peso_g, pacote.altura_cm, pacote.largura_cm, pacote.comprimento_cm):
                raise ValueError('Preencha peso e medidas do kit de envio')
        r = cliente.get('/sites/MLB/listing_prices', {
            'price': str(p), 'category_id': 'MLB6284', 'currency_id': 'BRL',
            'listing_type_id': listing_type, 'logistic_type': 'drop_off',
            'shipping_mode': 'me2',
        })
        if isinstance(r, list):
            r = next((x for x in r if x.get('listing_type_id') == listing_type), r[0])
        fixa = Decimal(str(r['sale_fee_details']['fixed_fee']))
        comissao = Decimal(str(r['sale_fee_amount'])) - fixa
        if p >= FRETE_GRATIS_A_PARTIR:
            f = cliente.get(f'/users/{cliente.ml_user_id}/shipping_options/free', {
                'dimensions': f'{pacote.altura_cm}x{pacote.largura_cm}x{pacote.comprimento_cm},{pacote.peso_g}',
                'item_price': str(p), 'listing_type_id': listing_type, 'mode': 'me2',
                'condition': 'new', 'logistic_type': 'drop_off', 'free_shipping': 'true',
            })
            frete = Decimal(str(f['coverage']['all_country']['list_cost']))
        cache[p] = Custos(comissao, fixa, frete)
        return cache[p]

    return consultar
