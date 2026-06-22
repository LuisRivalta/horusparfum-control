import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.auth.deps import get_current_user


class AuthDepsTest(unittest.TestCase):
    def test_get_current_user_uses_supabase_auth(self):
        auth = Mock()
        auth.get_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id="user-1", email="user@example.com")
        )

        with patch("app.auth.deps.get_supabase", return_value=SimpleNamespace(auth=auth)):
            user = get_current_user(SimpleNamespace(credentials="valid-token"))

        self.assertEqual(user, {"sub": "user-1", "email": "user@example.com"})
        auth.get_user.assert_called_once_with("valid-token")

    def test_get_current_user_rejects_invalid_token(self):
        auth = Mock()
        auth.get_user.side_effect = Exception("invalid")

        with patch("app.auth.deps.get_supabase", return_value=SimpleNamespace(auth=auth)):
            with self.assertRaises(HTTPException) as raised:
                get_current_user(SimpleNamespace(credentials="invalid-token"))

        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
