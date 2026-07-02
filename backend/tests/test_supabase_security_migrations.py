from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class SupabaseSecurityMigrationsTest(unittest.TestCase):
    def test_registrar_entrada_hardening_migration_revoga_public_e_limita_authenticated(self):
        migration = ROOT / "supabase" / "migrations" / "20260702_harden_registrar_entrada.sql"

        self.assertTrue(migration.exists(), "Migration de hardening da registrar_entrada deve existir")
        sql = migration.read_text(encoding="utf-8").lower()

        self.assertIn("set search_path = public", sql)
        self.assertIn("revoke all on function public.registrar_entrada", sql)
        self.assertIn("from public", sql)
        self.assertIn("grant execute on function public.registrar_entrada", sql)
        self.assertIn("to authenticated", sql)


if __name__ == "__main__":
    unittest.main()