"""IA opcional (Claude Haiku) para ficha técnica e textos dos anúncios do ML."""
import json
import re

from app.config import settings

MODELO = "claude-haiku-5-5"
_EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D<>]")
_AVISO = (
    "Não invente código de barras (GTIN), registro ANVISA nem números que não estejam nos dados."
)

_SCHEMA_FICHA = {
    "type": "object",
    "properties": {"atributos": {"type": "array", "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "value_id": {"type": ["string", "null"]}, "value_name": {"type": "string"}},
        "required": ["id", "value_id", "value_name"],
        "additionalProperties": False,
    }}},
    "required": ["atributos"],
    "additionalProperties": False,
}
_SCHEMA_TEXTOS = {
    "type": "object",
    "properties": {"anuncios": {"type": "array", "items": {
        "type": "object",
        "properties": {"chave": {"type": "string"}, "titulo": {"type": "string"}, "descricao": {"type": "string"}},
        "required": ["chave", "titulo", "descricao"],
        "additionalProperties": False,
    }}},
    "required": ["anuncios"],
    "additionalProperties": False,
}


def _chamar(prompt: str, schema: dict, cliente=None) -> dict:
    if cliente is None:
        import anthropic
        cliente = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    resposta = cliente.messages.create(
        model=MODELO,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": schema}},
    )
    if resposta.stop_reason in ("refusal", "max_tokens"):
        raise RuntimeError(f"IA sem resposta utilizável ({resposta.stop_reason})")
    return json.loads(resposta.content[0].text)


def sugerir_ficha(nome, marca, volume_ml, atributos, cliente=None) -> dict:
    if not settings.anthropic_api_key and cliente is None:
        return {}
    por_id = {a["id"]: a for a in atributos}
    lista = "\n".join(
        f"- {a['id']} ({a.get('name', '')}, {a.get('value_type', '')})"
        + (": " + "; ".join(f"{v['id']}={v['name']}" for v in a["values"]) if a.get("values") else "")
        for a in atributos
    )
    prompt = (
        "Você preenche a ficha técnica de um perfume para o Mercado Livre.\n"
        f"Perfume: {nome}\nMarca: {marca or 'desconhecida'}\nVolume: {volume_ml or 'desconhecido'} ml\n\n"
        f"Atributos permitidos (id, nome, tipo, valores id=nome):\n{lista}\n\n"
        "Devolva só atributos dessa lista que você sabe com segurança. Para atributo de lista use um "
        "value_id da lista (e value_name igual ao nome dele); para os demais, value_id null. "
        + _AVISO
    )
    dados = _chamar(prompt, _SCHEMA_FICHA, cliente)
    ficha = {}
    for it in dados.get("atributos", []):
        a = por_id.get(it.get("id"))
        if not a:
            continue
        if a.get("values"):
            if it.get("value_id") not in {v["id"] for v in a["values"]}:
                continue
        elif not it.get("value_name"):
            continue
        ficha[a["id"]] = {"value_id": it.get("value_id"), "value_name": it["value_name"]}
    return ficha


def _limpar(txt: str) -> str:
    return _EMOJI.sub("", txt or "").strip()


def gerar_textos(ficha, nome, marca, anuncios, modelo_descricao, cliente=None) -> list[dict]:
    if not settings.anthropic_api_key and cliente is None:
        raise RuntimeError("IA não configurada")
    prompt = (
        "Escreva título e descrição para anúncios de perfume no Mercado Livre, em português, "
        "sem emoji e sem HTML. Título com no máximo 150 caracteres.\n"
        f"Perfume: {nome}\nMarca: {marca}\nFicha: {json.dumps(ficha, ensure_ascii=False)}\n"
        f"Anúncios (chave, tipo frasco ou decant, ml): {json.dumps(anuncios, ensure_ascii=False)}\n\n"
        + (f"Siga este modelo de descrição:\n{modelo_descricao}\n\n" if modelo_descricao else
           "Sem modelo: faça descrição curta com marca, nome, tipo, volume, gênero e notas olfativas.\n\n")
        + _AVISO + " Devolva uma entrada por anúncio, com a mesma chave."
    )
    dados = _chamar(prompt, _SCHEMA_TEXTOS, cliente)
    return [
        {"chave": x["chave"], "titulo": _limpar(x["titulo"])[:150], "descricao": _limpar(x["descricao"])}
        for x in dados.get("anuncios", [])
    ]
