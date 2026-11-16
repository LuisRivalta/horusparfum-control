import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.config import settings
from app.services.anuncios import ia


def falso(dados, stop="end_turn"):
    def create(**kw):
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(dados))], stop_reason=stop)
    return SimpleNamespace(messages=SimpleNamespace(create=create))


ATRS = [
    {"id": "GENDER", "name": "Gênero", "value_type": "list", "values": [{"id": "339665", "name": "Feminino"}]},
    {"id": "PERFUME_TYPE", "name": "Tipo", "value_type": "list", "values": [{"id": "110465", "name": "Eau de Parfum"}]},
    {"id": "BRAND", "name": "Marca", "value_type": "string"},
]


def item(i, vid, nome):
    return {"id": i, "value_id": vid, "value_name": nome}


class FichaTest(unittest.TestCase):
    def test_ficha_descarta_valor_fora_da_lista(self):
        c = falso({"atributos": [item("GENDER", "999", "X"), item("PERFUME_TYPE", "110465", "Eau de Parfum")]})
        with patch.object(settings, "anthropic_api_key", "k"):
            r = ia.sugerir_ficha("A", "B", 100, ATRS, cliente=c)
        self.assertEqual(list(r), ["PERFUME_TYPE"])
        self.assertEqual(r["PERFUME_TYPE"], {"value_id": "110465", "value_name": "Eau de Parfum"})

    def test_ficha_descarta_atributo_inexistente(self):
        c = falso({"atributos": [item("INVENTADO", None, "x"), item("BRAND", None, "Dior")]})
        with patch.object(settings, "anthropic_api_key", "k"):
            r = ia.sugerir_ficha("A", "B", 100, ATRS, cliente=c)
        self.assertEqual(r, {"BRAND": {"value_id": None, "value_name": "Dior"}})

    def test_ficha_sem_chave_vazia(self):
        with patch.object(settings, "anthropic_api_key", ""):
            self.assertEqual(ia.sugerir_ficha("A", "B", 100, ATRS), {})

    def test_ficha_recusa_vira_erro(self):
        with patch.object(settings, "anthropic_api_key", "k"):
            with self.assertRaises(RuntimeError):
                ia.sugerir_ficha("A", "B", 1, ATRS, cliente=falso({}, stop="refusal"))


class TextosTest(unittest.TestCase):
    def test_textos_limpa_emoji_e_menor_que(self):
        c = falso({"anuncios": [{"chave": "a", "titulo": "T" * 200, "descricao": "Ótimo 🔥 <b>perfume</b> ❤️"}]})
        with patch.object(settings, "anthropic_api_key", "k"):
            r = ia.gerar_textos({}, "N", "M", [{"chave": "a", "tipo": "frasco", "ml": 100}], "", cliente=c)
        self.assertEqual(len(r[0]["titulo"]), 150)
        d = r[0]["descricao"]
        self.assertNotIn("🔥", d)
        self.assertNotIn("<", d)
        self.assertNotIn(">", d)
        self.assertNotIn("❤", d)
        self.assertIn("Ótimo", d)

    def test_textos_sem_chave_erro(self):
        with patch.object(settings, "anthropic_api_key", ""):
            with self.assertRaises(RuntimeError):
                ia.gerar_textos({}, "N", "M", [], "")


if __name__ == "__main__":
    unittest.main()
