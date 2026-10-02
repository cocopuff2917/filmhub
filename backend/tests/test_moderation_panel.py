"""Tests for new moderator/admin panel endpoints: stats, suspensions, edits filters."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"identifier": "admin@cineverse.com", "password": "Admin@123"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# ---- /api/moderation/stats ----
class TestModerationStats:
    def test_stats_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/moderation/stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("content", "users", "reports", "activity", "recent_edits", "active_suspensions"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["recent_edits"], list)
        assert isinstance(data["active_suspensions"], list)
        for sub, keys in [
            ("content", ("movies", "series", "actors", "collections", "trash")),
            ("users", ("total", "moderators", "active_suspensions", "new_7d")),
            ("reports", ("open",)),
            ("activity", ("edits_24h", "edits_7d")),
        ]:
            for k in keys:
                assert k in data[sub], f"missing {sub}.{k}"
                assert isinstance(data[sub][k], int)

    def test_stats_requires_mod(self):
        r = requests.get(f"{BASE_URL}/api/moderation/stats", timeout=15)
        assert r.status_code in (401, 403)


# ---- /api/moderation/suspensions ----
class TestSuspensions:
    def test_list_active(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/moderation/suspensions", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for u in data:
            assert u.get("is_active") is True
            for k in ("id", "name", "suspended_until", "suspension_reason"):
                assert k in u

    def test_include_expired(self, admin_session):
        r1 = admin_session.get(f"{BASE_URL}/api/moderation/suspensions", timeout=15)
        r2 = admin_session.get(f"{BASE_URL}/api/moderation/suspensions?include_expired=true", timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        a = r1.json()
        b = r2.json()
        assert len(b) >= len(a), f"include_expired should return >= active ({len(b)} vs {len(a)})"


# ---- /api/edits filters ----
class TestEditsFilters:
    def test_basic_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/edits?limit=5", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_entity_type_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/edits?entity_type=movie&limit=20", timeout=15)
        assert r.status_code == 200
        for e in r.json():
            assert e.get("entity_type") == "movie"

    def test_action_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/edits?action=update&limit=20", timeout=15)
        assert r.status_code == 200
        for e in r.json():
            assert e.get("action") == "update"

    def test_q_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/edits?q=admin&limit=10", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_date_filter(self, admin_session):
        # Future date range should return empty
        r = admin_session.get(f"{BASE_URL}/api/edits?date_from=2099-01-01&date_to=2099-12-31", timeout=15)
        assert r.status_code == 200
        assert r.json() == []

    def test_user_id_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/edits?user_id=nonexistent&limit=5", timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# ---- Regression smoke on existing endpoints ----
class TestRegressionSmoke:
    def test_edits_without_filters(self, admin_session):
        assert admin_session.get(f"{BASE_URL}/api/edits", timeout=15).status_code == 200

    def test_threads_report_category(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/threads?category=report&status=open", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
