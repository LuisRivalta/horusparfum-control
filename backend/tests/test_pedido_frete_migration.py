import unittest
from pathlib import Path


class PedidoFreteMigrationTest(unittest.TestCase):
    def test_migration_adiciona_frete_em_pedidos(self):
        root = Path(__file__).resolve().parents[2]
        migrations = list((root / 'supabase' / 'migrations').glob('*_frete_pedidos.sql'))
        self.assertEqual(len(migrations), 1, 'Migration de frete dos pedidos nao encontrada')

        sql = migrations[0].read_text(encoding='utf-8').lower()
        self.assertIn('alter table pedidos', sql)
        self.assertIn('add column if not exists frete', sql)
        self.assertIn('numeric(12,2)', sql)
        self.assertIn('default 0', sql)
        self.assertIn('frete >= 0', sql)


if __name__ == '__main__':
    unittest.main()
