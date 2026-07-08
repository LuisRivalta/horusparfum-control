import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import ADMIN_EMAIL, get_admin_user
from app.main import app


class AdminRouterUsersTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_admin_user] = lambda: {
            "sub": "admin-id",
            "email": ADMIN_EMAIL,
        }
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_list_users_returns_normalized_auth_users(self):
        user = SimpleNamespace(
            id="user-1",
            email="operador@example.com",
            created_at="2026-07-01T10:00:00Z",
            last_sign_in_at="2026-07-02T10:00:00Z",
        )
        supabase = SimpleNamespace(auth=SimpleNamespace(admin=Mock()))
        supabase.auth.admin.list_users.return_value = SimpleNamespace(users=[user])

        with patch("app.routers.admin.get_supabase", return_value=supabase):
            response = self.client.get("/api/admin/users")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "users": [
                    {
                        "id": "user-1",
                        "email": "operador@example.com",
                        "created_at": "2026-07-01T10:00:00Z",
                        "last_sign_in_at": "2026-07-02T10:00:00Z",
                    }
                ]
            },
        )

    def test_create_user_uses_email_confirmed_temporary_password(self):
        created = SimpleNamespace(
            id="user-2",
            email="novo@example.com",
            created_at="2026-07-03T10:00:00Z",
            last_sign_in_at=None,
        )
        supabase = SimpleNamespace(auth=SimpleNamespace(admin=Mock()))
        supabase.auth.admin.create_user.return_value = SimpleNamespace(user=created)

        with patch("app.routers.admin.get_supabase", return_value=supabase):
            response = self.client.post(
                "/api/admin/users",
                json={"email": "novo@example.com", "password": "senha123"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["email"], "novo@example.com")
        supabase.auth.admin.create_user.assert_called_once_with(
            {
                "email": "novo@example.com",
                "password": "senha123",
                "email_confirm": True,
            }
        )

    def test_delete_user_removes_non_admin_user(self):
        supabase = SimpleNamespace(auth=SimpleNamespace(admin=Mock()))
        supabase.auth.admin.get_user_by_id.return_value = SimpleNamespace(
            user=SimpleNamespace(id="user-3", email="operador@example.com")
        )
        supabase.auth.admin.delete_user.return_value = None

        with patch("app.routers.admin.get_supabase", return_value=supabase):
            response = self.client.delete("/api/admin/users/user-3")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": {"users": 1}})
        supabase.auth.admin.delete_user.assert_called_once_with("user-3")

    def test_delete_user_rejects_current_admin(self):
        supabase = SimpleNamespace(auth=SimpleNamespace(admin=Mock()))
        supabase.auth.admin.get_user_by_id.return_value = SimpleNamespace(
            user=SimpleNamespace(id="admin-id", email=ADMIN_EMAIL)
        )

        with patch("app.routers.admin.get_supabase", return_value=supabase):
            response = self.client.delete("/api/admin/users/admin-id")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "O admin principal nao pode ser removido")
        supabase.auth.admin.delete_user.assert_not_called()


if __name__ == "__main__":
    unittest.main()

class AdminRouterEntitiesTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_admin_user] = lambda: {'sub': 'admin-id', 'email': ADMIN_EMAIL}
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_list_entity_returns_items(self):
        with patch('app.routers.admin.get_supabase', return_value=object()), patch('app.routers.admin.admin_service.list_admin_entities', return_value=[{'id': 'p1', 'nome': 'Perfume'}]) as service:
            response = self.client.get('/api/admin/produtos?search=Perf')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'items': [{'id': 'p1', 'nome': 'Perfume'}]})
        self.assertEqual(service.call_args.args[1:], ('produtos', 'Perf'))

    def test_delete_entity_returns_summary(self):
        with patch('app.routers.admin.get_supabase', return_value=object()), patch('app.routers.admin.admin_service.delete_admin_entity', return_value={'metas': 1}) as service:
            response = self.client.delete('/api/admin/metas/m1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'deleted': {'metas': 1}})
        self.assertEqual(service.call_args.args[1:], ('metas', 'm1'))
