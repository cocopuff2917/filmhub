"""Tests that /api/actors, /api/movies, /api/series no longer cap at 100 results."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASSWORD = "Admin@123"

PREFIX = f"TEST_UNCAP_{uuid.uuid4().hex[:8]}_"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_actors(admin_session):
    ids = []
    for i in range(110):
        name = f"{PREFIX}Actor_{i:03d}"
        r = admin_session.post(f"{API}/actors", json={"name": name})
        assert r.status_code in (200, 201), f"create failed {i}: {r.status_code} {r.text}"
        ids.append(r.json()["id"])
    yield ids
    # cleanup
    for aid in ids:
        admin_session.delete(f"{API}/actors/{aid}")


def test_list_actors_returns_all_created(admin_session, created_actors):
    r = admin_session.get(f"{API}/actors")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 100, f"Expected > 100 actors, got {len(data)}"
    returned_ids = {a["id"] for a in data}
    missing = set(created_actors) - returned_ids
    assert not missing, f"Missing {len(missing)} created actors from list"


def test_list_actors_respects_caller_limit(admin_session, created_actors):
    r = admin_session.get(f"{API}/actors", params={"limit": 5})
    assert r.status_code == 200
    assert len(r.json()) == 5


def test_list_actors_search_still_works(admin_session, created_actors):
    r = admin_session.get(f"{API}/actors", params={"q": PREFIX})
    assert r.status_code == 200
    results = r.json()
    assert len(results) >= 110, f"Search returned {len(results)}"


def test_duplicate_actor_name_409(admin_session, created_actors):
    name = f"{PREFIX}Actor_000"
    r = admin_session.post(f"{API}/actors", json={"name": name})
    assert r.status_code == 409


def test_list_movies_unlimited(admin_session):
    r = admin_session.get(f"{API}/movies")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_series_unlimited(admin_session):
    r = admin_session.get(f"{API}/series")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
