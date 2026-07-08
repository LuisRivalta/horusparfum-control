import sys
import types
import unittest

from fastapi import HTTPException

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import ADMIN_EMAIL, get_admin_user


class AdminAuthTest(unittest.TestCase):
    def test_get_admin_user_allows_admin_email(self):
        user = {"email": ADMIN_EMAIL, "sub": "admin-1"}

        result = get_admin_user(user)

        self.assertEqual(result, user)

    def test_get_admin_user_rejects_non_admin_email(self):
        user = {"email": "operator@example.com", "sub": "user-1"}

        with self.assertRaises(HTTPException) as raised:
            get_admin_user(user)

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail, "Acesso administrativo restrito")


if __name__ == "__main__":
    unittest.main()
