import sys
import types
import unittest

fake_supabase_module = types.ModuleType('supabase')
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault('supabase', fake_supabase_module)

from app.services.admin import delete_admin_entity, list_admin_entities


class FakeResult:
    def __init__(self, data=None):
        self.data = data or []


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.mode = 'select'
        self.filters = []
    def select(self, columns):
        self.db.ops.append((self.table, 'select', columns))
        return self
    def delete(self):
        self.mode = 'delete'
        self.db.ops.append((self.table, 'delete'))
        return self
    def eq(self, column, value):
        self.filters.append((column, value))
        return self
    def in_(self, column, values):
        self.filters.append((column, tuple(values)))
        return self
    def ilike(self, column, value):
        self.db.ops.append((self.table, 'ilike', column, value))
        return self
    def order(self, column, desc=False):
        return self
    def limit(self, value):
        self.db.ops.append((self.table, 'limit', value))
        return self
    def execute(self):
        data = list(self.db.data.get(self.table, []))
        for column, value in self.filters:
            if isinstance(value, tuple):
                data = [row for row in data if row.get(column) in value]
            else:
                data = [row for row in data if row.get(column) == value]
        if self.mode == 'delete':
            self.db.deleted.append(self.table)
        return FakeResult(data)


class FakeSupabase:
    def __init__(self, data=None):
        self.data = data or {}
        self.ops = []
        self.deleted = []
    def table(self, name):
        return FakeQuery(self, name)


class AdminServiceTest(unittest.TestCase):
    def test_list_admin_entities_applies_search_and_limit(self):
        db = FakeSupabase({'produtos': [{'id': 'p1', 'nome': 'Perfume'}]})
        result = list_admin_entities(db, 'produtos', 'Perf')
        self.assertEqual(result, [{'id': 'p1', 'nome': 'Perfume'}])
        self.assertIn(('produtos', 'ilike', 'nome', '%%Perf%%'), db.ops)
        self.assertIn(('produtos', 'limit', 50), db.ops)
    def test_delete_simple_entity_removes_directly(self):
        db = FakeSupabase({'metas': [{'id': 'm1'}]})
        summary = delete_admin_entity(db, 'metas', 'm1')
        self.assertEqual(summary, {'metas': 1})
        self.assertEqual(db.deleted, ['metas'])

    def test_delete_venda_removes_related_records_first(self):
        db = FakeSupabase({'venda_itens': [{'id': 'vi1', 'venda_id': 'v1', 'decant_id': 'd1'}], 'transacoes': [{'id': 't1', 'venda_id': 'v1'}], 'decants': [{'id': 'd1'}], 'vendas': [{'id': 'v1'}]})
        summary = delete_admin_entity(db, 'vendas', 'v1')
        self.assertEqual(summary, {'transacoes': 1, 'venda_itens': 1, 'decants': 1, 'vendas': 1})
        self.assertEqual(db.deleted, ['transacoes', 'venda_itens', 'decants', 'vendas'])

    def test_delete_pedido_removes_divergencias_itens_and_pedido(self):
        db = FakeSupabase({'pedido_itens': [{'id': 'pi1', 'pedido_id': 'pe1'}], 'divergencias': [{'id': 'd1', 'pedido_id': 'pe1'}], 'pedidos': [{'id': 'pe1'}]})
        summary = delete_admin_entity(db, 'pedidos', 'pe1')
        self.assertEqual(summary, {'divergencias': 1, 'pedido_itens': 1, 'pedidos': 1})
        self.assertEqual(db.deleted, ['divergencias', 'pedido_itens', 'pedidos'])

    def test_delete_produto_removes_operational_dependencies_before_product(self):
        db = FakeSupabase({'movimentacoes': [{'id': 'm1', 'produto_id': 'p1'}], 'pedido_itens': [{'id': 'pi1', 'produto_id': 'p1', 'pedido_id': 'pe1'}], 'divergencias': [{'id': 'd1', 'pedido_item_id': 'pi1'}], 'frascos_abertos': [{'id': 'f1', 'produto_id': 'p1'}], 'decants': [{'id': 'de1', 'produto_id': 'p1', 'frasco_id': 'f1'}], 'venda_itens': [{'id': 'vi1', 'produto_id': 'p1', 'venda_id': 'v1', 'decant_id': 'de1'}], 'transacoes': [{'id': 't1', 'venda_id': 'v1'}], 'vendas': [{'id': 'v1'}], 'produtos': [{'id': 'p1'}]})
        summary = delete_admin_entity(db, 'produtos', 'p1')
        self.assertEqual(summary['produtos'], 1)
        self.assertEqual(db.deleted, ['movimentacoes', 'divergencias', 'pedido_itens', 'transacoes', 'venda_itens', 'decants', 'frascos_abertos', 'vendas', 'produtos'])


if __name__ == '__main__':
    unittest.main()
