from pathlib import Path
import unittest


class CorrecaoTransacoesMigrationTest(unittest.TestCase):
    def test_migration_define_vinculo_e_rpcs_atomicas(self):
        root = Path(__file__).resolve().parents[2]
        migrations = list((root / 'supabase' / 'migrations').glob('*_correcao_unificada_transacoes.sql'))
        self.assertEqual(len(migrations), 1)

        sql = migrations[0].read_text(encoding='utf-8').lower()
        for trecho in (
            'add column if not exists decant_id uuid references decants(id)',
            'create or replace function editar_venda',
            'create or replace function corrigir_consumo_decant',
            "v_venda.status = 'cancelada'",
            "origem = 'venda'",
            "origem = 'decant'",
            'for update',
            'perform cancelar_venda(p_venda_id)',
        ):
            self.assertIn(trecho, sql)


if __name__ == '__main__':
    unittest.main()
