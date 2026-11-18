# [CLAUDE-CODE-AUDIT]
# ID                 : 20261118-164158-7cca
# Tipo de item       : Script Python
# Autores            : luisgfr; MS125; Claude Code
# Titulo             : Horus Shopify: publicar.py
# Assunto            : Monta o productSet com variantes e rotulos
# Origem             : solicitacao do usuario
# Motivo             : Luis pediu publicar produto na Shopify
# Criado em          : 2026-11-18 16:40:40
# Registro           : C:\Users\luisgfr\biblioteca-claude\logs\claude-auditoria.log
# [/CLAUDE-CODE-AUDIT]
import html
from decimal import Decimal

OPCAO = 'Tamanho'

PRODUCT_SET = '''
mutation($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product {
      legacyResourceId
      variants(first: 100) {
        nodes { legacyResourceId title selectedOptions { name value } inventoryItem { id } }
      }
    }
    userErrors { field message }
  }
}'''


def ml_texto(ml) -> str:
    """2.5 -> '2,5'; 100.0 -> '100'."""
    return format(Decimal(str(ml)).normalize(), 'f').replace('.', ',')


def rotulo(tipo: str, ml, tipo_produto: str, volume_ml) -> str:
    if tipo == 'decant':
        return f'Decant {ml_texto(ml)} ml'
    base = f'{ml_texto(volume_ml)} ml'
    return f'Frasco {base}' if tipo_produto == 'Perfume' else base


def montar_produto(dados: dict, location_id: str) -> dict:
    rotulos = [rotulo(v['tipo'], v.get('ml'), dados['tipo_produto'], dados.get('volume_ml'))
               for v in dados['variantes']]
    return {
        'title': dados['titulo'],
        'descriptionHtml': html.escape(dados.get('descricao') or '').replace('\n', '<br>'),
        'status': 'ACTIVE',
        'productOptions': [{'name': OPCAO, 'values': [{'name': r} for r in rotulos]}],
        'variants': [
            {
                'optionValues': [{'optionName': OPCAO, 'name': r}],
                'price': str(Decimal(str(v['preco'])).quantize(Decimal('0.01'))),
                'inventoryItem': {'tracked': True},
                'inventoryQuantities': [{'locationId': location_id, 'name': 'available', 'quantity': 0}],
            }
            for v, r in zip(dados['variantes'], rotulos)
        ],
        'files': [{'originalSource': u, 'contentType': 'IMAGE'} for u in dados.get('fotos') or [] if u],
    }
