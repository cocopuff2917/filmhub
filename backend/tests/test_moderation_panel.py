"""Tests for new moderator/admin panel endpoints: stats, suspensions, edits filters."""
import os
import uuid
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


def test_tmdb_imports_can_be_paused_and_only_admin_can_enable(admin_session):
    api = f"{BASE_URL}/api"
    setting_path = f"{api}/moderation/tmdb/settings"
    previous = admin_session.get(setting_path, timeout=15)
    assert previous.status_code == 200, previous.text
    previous_enabled = previous.json()["enabled"]

    email = f"tmdb_toggle_{uuid.uuid4().hex[:12]}@test.com"
    password = "Test@1234"
    registered = requests.post(
        f"{api}/auth/register",
        json={"email": email, "password": password, "name": f"Tmdb_{uuid.uuid4().hex[:8]}"},
        timeout=15,
    )
    assert registered.status_code == 200, registered.text
    user_id = registered.json()["id"]
    promoted = admin_session.patch(f"{api}/moderation/users/{user_id}/role", json={"role": "moderator"}, timeout=15)
    assert promoted.status_code == 200, promoted.text

    moderator = requests.Session()
    logged_in = moderator.post(f"{api}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert logged_in.status_code == 200, logged_in.text

    try:
        paused = admin_session.put(setting_path, json={"enabled": False}, timeout=15)
        assert paused.status_code == 200, paused.text
        assert paused.json()["enabled"] is False

        assert moderator.get(setting_path, timeout=15).json()["enabled"] is False
        denied_toggle = moderator.put(setting_path, json={"enabled": True}, timeout=15)
        assert denied_toggle.status_code == 403

        denied_search = moderator.get(
            f"{api}/moderation/tmdb/search", params={"kind": "movie", "q": "Example"}, timeout=15
        )
        assert denied_search.status_code == 403
        denied_import = moderator.post(
            f"{api}/moderation/tmdb/import", json={"kind": "movie", "tmdb_id": 1}, timeout=15
        )
        assert denied_import.status_code == 403
    finally:
        restored = admin_session.put(setting_path, json={"enabled": previous_enabled}, timeout=15)
        assert restored.status_code == 200, restored.text
        demoted = admin_session.patch(f"{api}/moderation/users/{user_id}/role", json={"role": "user"}, timeout=15)
        assert demoted.status_code == 200, demoted.text


def test_content_edit_freeze_blocks_users_and_moderators(admin_session):
    api = f"{BASE_URL}/api"
    setting_path = f"{api}/moderation/content-edit-freeze"
    previous = admin_session.get(setting_path, timeout=15)
    assert previous.status_code == 200, previous.text
    previous_frozen = previous.json()["frozen"]

    email = f"content_freeze_{uuid.uuid4().hex[:12]}@test.com"
    password = "Test@1234"
    registered = requests.post(
        f"{api}/auth/register",
        json={"email": email, "password": password, "name": f"Freeze_{uuid.uuid4().hex[:8]}"},
        timeout=15,
    )
    assert registered.status_code == 200, registered.text
    user_id = registered.json()["id"]
    member = requests.Session()
    logged_in = member.post(f"{api}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert logged_in.status_code == 200, logged_in.text

    try:
        paused = admin_session.put(setting_path, json={"frozen": True}, timeout=15)
        assert paused.status_code == 200, paused.text
        assert paused.json()["frozen"] is True

        update_requests = (
            ("/movies/not-an-object-id", {"title": "Blocked"}),
            ("/series/not-an-object-id", {"title": "Blocked"}),
            ("/movies/not-an-object-id", {"poster_urls": ["https://example.com/paused.jpg"]}),
            ("/series/not-an-object-id", {"video_urls": ["https://youtube.com/watch?v=paused"]}),
            ("/actors/not-an-object-id", {"photo_url": "https://example.com/paused.jpg"}),
        )
        create_requests = (
            ("/movies", {"title": "Blocked movie", "release_date": "2099-01-01"}),
            ("/series", {"title": "Blocked series"}),
            ("/actors", {"name": "Blocked actor"}),
        )
        assert member.get(setting_path, timeout=15).json()["frozen"] is True
        for path, payload in update_requests:
            assert member.patch(f"{api}{path}", json=payload, timeout=15).status_code == 403
        for path, payload in create_requests:
            assert member.post(f"{api}{path}", json=payload, timeout=15).status_code == 403
        assert member.put(setting_path, json={"frozen": False}, timeout=15).status_code == 403

        promoted = admin_session.patch(f"{api}/moderation/users/{user_id}/role", json={"role": "moderator"}, timeout=15)
        assert promoted.status_code == 200, promoted.text
        for path, payload in update_requests:
            assert member.patch(f"{api}{path}", json=payload, timeout=15).status_code == 403
        for path, payload in create_requests:
            assert member.post(f"{api}{path}", json=payload, timeout=15).status_code == 403
        assert member.put(setting_path, json={"frozen": False}, timeout=15).status_code == 403
    finally:
        restored = admin_session.put(setting_path, json={"frozen": previous_frozen}, timeout=15)
        assert restored.status_code == 200, restored.text
        demoted = admin_session.patch(f"{api}/moderation/users/{user_id}/role", json={"role": "user"}, timeout=15)
        assert demoted.status_code == 200, demoted.text


def test_moderator_can_delete_reviews_but_regular_user_cannot(admin_session):
    api = f"{BASE_URL}/api"
    password = "Test@1234"
    moderator_email = f"review_mod_{uuid.uuid4().hex[:12]}@test.com"
    member_email = f"review_member_{uuid.uuid4().hex[:12]}@test.com"
    moderator_registration = requests.post(
        f"{api}/auth/register",
        json={"email": moderator_email, "password": password, "name": "Review moderator"},
        timeout=15,
    )
    member_registration = requests.post(
        f"{api}/auth/register",
        json={"email": member_email, "password": password, "name": "Review member"},
        timeout=15,
    )
    assert moderator_registration.status_code == 200, moderator_registration.text
    assert member_registration.status_code == 200, member_registration.text
    moderator_id = moderator_registration.json()["id"]
    admin_session.patch(
        f"{api}/moderation/users/{moderator_id}/role", json={"role": "moderator"}, timeout=15
    )

    moderator = requests.Session()
    member = requests.Session()
    assert moderator.post(
        f"{api}/auth/login", json={"email": moderator_email, "password": password}, timeout=15
    ).status_code == 200
    assert member.post(
        f"{api}/auth/login", json={"email": member_email, "password": password}, timeout=15
    ).status_code == 200

    movie_id = f"review-delete-test-{uuid.uuid4().hex}"
    review_path = f"{api}/movies/{movie_id}/reviews"
    review_id = None
    try:
        assert admin_session.post(
            review_path,
            json={"rating": 8, "text": "Review moderation test", "contains_spoilers": False},
            timeout=15,
        ).status_code == 200
        reviews = admin_session.get(review_path, timeout=15)
        assert reviews.status_code == 200, reviews.text
        review_id = reviews.json()[0]["id"]

        denied = member.delete(f"{api}/reviews/{review_id}", timeout=15)
        assert denied.status_code == 403, denied.text
        deleted = moderator.delete(f"{api}/reviews/{review_id}", timeout=15)
        assert deleted.status_code == 200, deleted.text
        assert deleted.json() == {"ok": True}
    finally:
        if review_id:
            admin_session.delete(f"{api}/reviews/{review_id}", timeout=15)
        admin_session.patch(
            f"{api}/moderation/users/{moderator_id}/role", json={"role": "user"}, timeout=15
        )


def test_tmdb_cast_backfill_requires_admin():
    response = requests.post(
        f"{BASE_URL}/api/moderation/tmdb/backfill-cast",
        json={"kind": "movie", "limit": 1},
        timeout=15,
    )
    assert response.status_code in (401, 403)


def test_tmdb_cast_backfill_validates_kind_and_batch_limit(admin_session):
    endpoint = f"{BASE_URL}/api/moderation/tmdb/backfill-cast"
    invalid_kind = admin_session.post(endpoint, json={"kind": "actor", "limit": 1}, timeout=15)
    assert invalid_kind.status_code == 400, invalid_kind.text
    invalid_limit = admin_session.post(endpoint, json={"kind": "movie", "limit": 26}, timeout=15)
    assert invalid_limit.status_code == 422, invalid_limit.text


def test_tmdb_cast_cron_requires_shared_secret():
    response = requests.post(f"{BASE_URL}/api/cron/tmdb-cast-backfill", timeout=15)
    assert response.status_code == 401, response.text
