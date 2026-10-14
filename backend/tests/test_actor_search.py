"""Tests for GET /api/actors live search (bug fix: CastEditDialog typeahead
should surface actors beyond preloaded cache and newly-created actors)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    yield s


@pytest.fixture(scope="module")
def created_actors(admin_session):
    """Create a unique test actor and clean up at the end."""
    unique = f"TEST_Actor_{uuid.uuid4().hex[:8]}"
    r = admin_session.post(f"{API}/actors", json={"name": unique})
    assert r.status_code == 200, f"Create actor failed: {r.status_code} {r.text}"
    actor = r.json()
    assert actor.get("id") and actor.get("name") == unique
    yield [actor]
    # Teardown — soft-delete
    try:
        admin_session.delete(f"{API}/actors/{actor['id']}")
    except Exception:
        pass


# --- live search endpoint ---
class TestActorsLiveSearch:
    def test_search_returns_matching_actor_case_insensitive(self, admin_session, created_actors):
        name = created_actors[0]["name"]
        # partial, lowercased
        q = name[:10].lower()
        r = admin_session.get(f"{API}/actors", params={"q": q, "limit": 15})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = [a["id"] for a in data]
        assert created_actors[0]["id"] in ids, f"Expected newly-created actor in search results, got {ids}"

    def test_search_respects_limit(self, admin_session):
        r = admin_session.get(f"{API}/actors", params={"q": "a", "limit": 5})
        assert r.status_code == 200
        assert len(r.json()) <= 5

    def test_search_empty_q_returns_list(self, admin_session):
        r = admin_session.get(f"{API}/actors", params={"limit": 10})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_credit_status_marks_uncredited_actor(self, admin_session, created_actors):
        actor = created_actors[0]
        response = admin_session.get(
            f"{API}/actors",
            params={"q": actor["name"], "include_credit_status": "true"},
        )
        assert response.status_code == 200, response.text
        listed_actor = next(row for row in response.json() if row["id"] == actor["id"])
        assert listed_actor["has_acting_credits"] is False
        assert listed_actor["is_empty_duplicate"] is False

    def test_empty_duplicate_delete_rejects_actor_without_duplicate(self, admin_session, created_actors):
        actor_id = created_actors[0]["id"]
        response = admin_session.delete(f"{API}/actors/{actor_id}/empty-duplicate")
        assert response.status_code == 409, response.text
        assert admin_session.get(f"{API}/actors/{actor_id}").status_code == 200

    def test_search_nonexistent_returns_empty(self, admin_session):
        r = admin_session.get(f"{API}/actors", params={"q": f"ZZZ_NOPE_{uuid.uuid4().hex}", "limit": 15})
        assert r.status_code == 200
        assert r.json() == []


# --- dedupe guard regression (409 on exact duplicate POST) ---
class TestActorDedupeGuard:
    def test_duplicate_name_returns_409(self, admin_session, created_actors):
        name = created_actors[0]["name"]
        r = admin_session.post(f"{API}/actors", json={"name": name})
        assert r.status_code == 409, f"Expected 409 duplicate guard, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        assert "already exists" in detail.lower()

    def test_duplicate_name_case_insensitive_whitespace(self, admin_session, created_actors):
        name = created_actors[0]["name"]
        r = admin_session.post(f"{API}/actors", json={"name": f"  {name.upper()}  "})
        assert r.status_code == 409
