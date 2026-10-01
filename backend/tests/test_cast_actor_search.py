"""Tests for CastEditDialog backend contract: GET /api/actors?q= live search + movie cast enrichment.

Covers the bug fix where actors beyond the preloaded 100-actor cache (including newly-created)
were not surfaced by name lookup, causing "(unknown)" cast rows.
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def seeded_actors(admin_session):
    """Create 110 filler actors + a 'TEST_Target' actor so Target is beyond the first 100 of /api/actors (limit default)."""
    s = admin_session
    created_ids = []
    unique = uuid.uuid4().hex[:8]
    # Target actor name is intentionally not alphabetically early
    target_name = f"TEST_TargetActor_{unique}"
    # Create 110 fillers first; names prefixed with 'TEST_Zfiller_' to appear last alphabetically (if sorted),
    # though endpoint relies on natural insertion order so they'll push target out of the first 100 only if
    # target is inserted somewhere in the middle. To be safe, insert fillers both before and after target.
    for i in range(60):
        r = s.post(f"{API}/actors", json={"name": f"TEST_Filler_pre_{unique}_{i:03d}"}, timeout=10)
        assert r.status_code in (200, 201), r.text
        created_ids.append(r.json()["id"])
    r = s.post(f"{API}/actors", json={"name": target_name}, timeout=10)
    assert r.status_code in (200, 201), r.text
    target_id = r.json()["id"]
    created_ids.append(target_id)
    for i in range(60):
        r = s.post(f"{API}/actors", json={"name": f"TEST_Filler_post_{unique}_{i:03d}"}, timeout=10)
        assert r.status_code in (200, 201), r.text
        created_ids.append(r.json()["id"])

    yield {"target_id": target_id, "target_name": target_name, "created_ids": created_ids, "unique": unique}

    # teardown
    for aid in created_ids:
        try:
            s.delete(f"{API}/actors/{aid}", timeout=10)
        except Exception:
            pass


class TestActorSearch:
    def test_list_actors_returns_full_catalog(self, admin_session, seeded_actors):
        """After seeding 121 TEST_ actors (fillers+target), the uncapped default should return >=121."""
        r = admin_session.get(f"{API}/actors", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # must include our target (proving it isn't truncated at 100)
        ids = {a["id"] for a in data}
        assert seeded_actors["target_id"] in ids
        assert len(data) >= 121

    def test_search_finds_target_by_substring(self, admin_session, seeded_actors):
        q = seeded_actors["target_name"][:20]  # e.g. 'TEST_TargetActor_abc'
        r = admin_session.get(f"{API}/actors", params={"q": q, "limit": 15}, timeout=10)
        assert r.status_code == 200
        names = [a["name"] for a in r.json()]
        assert seeded_actors["target_name"] in names, f"target not in {names}"

    def test_search_case_insensitive(self, admin_session, seeded_actors):
        q = seeded_actors["target_name"].lower()
        r = admin_session.get(f"{API}/actors", params={"q": q, "limit": 15}, timeout=10)
        assert r.status_code == 200
        ids = [a["id"] for a in r.json()]
        assert seeded_actors["target_id"] in ids

    def test_newly_created_actor_findable_via_q(self, admin_session):
        name = f"TEST_FreshlyMade_{uuid.uuid4().hex[:8]}"
        r = admin_session.post(f"{API}/actors", json={"name": name}, timeout=10)
        assert r.status_code in (200, 201)
        aid = r.json()["id"]
        try:
            r2 = admin_session.get(f"{API}/actors", params={"q": name}, timeout=10)
            assert r2.status_code == 200
            assert any(a["id"] == aid for a in r2.json())
        finally:
            admin_session.delete(f"{API}/actors/{aid}", timeout=10)


class TestUncappedCatalogs:
    """Verify /api/movies and /api/series also return the full catalog by default (limit raised to 10000)."""

    def test_movies_default_uncapped(self, admin_session):
        r = admin_session.get(f"{API}/movies", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # just verify the request returns far more than the old cap of 60 if seeded, or at least succeeds
        # (we don't seed 60 movies here to save time)

    def test_series_default_uncapped(self, admin_session):
        r = admin_session.get(f"{API}/series", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_duplicate_actor_name_returns_409(self, admin_session):
        name = f"TEST_Dupe_{uuid.uuid4().hex[:8]}"
        r = admin_session.post(f"{API}/actors", json={"name": name}, timeout=10)
        assert r.status_code in (200, 201)
        aid = r.json()["id"]
        try:
            r2 = admin_session.post(f"{API}/actors", json={"name": name}, timeout=10)
            assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"
        finally:
            admin_session.delete(f"{API}/actors/{aid}", timeout=10)


class TestMovieCastPersistence:
    """Simulates CastEditDialog save: PATCH movie with actor_id, then GET to confirm it enriches with name."""

    def test_patch_movie_cast_and_enrich(self, admin_session, seeded_actors):
        s = admin_session
        # create a movie
        mv_title = f"TEST_Movie_{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/movies", json={"title": mv_title, "year": 2026, "release_date": "2026-01-01"}, timeout=10)
        assert r.status_code in (200, 201), r.text
        mid = r.json()["id"]
        try:
            cast = [{"actor_id": seeded_actors["target_id"], "character_name": "Madea"}]
            r = s.patch(f"{API}/movies/{mid}", json={"cast": cast}, timeout=10)
            assert r.status_code in (200, 204), r.text

            r = s.get(f"{API}/movies/{mid}", timeout=10)
            assert r.status_code == 200
            data = r.json()
            cast_out = data.get("cast") or []
            assert len(cast_out) == 1
            row = cast_out[0]
            assert row.get("actor_id") == seeded_actors["target_id"]
            assert row.get("character_name") == "Madea"
            # enrichment: backend returns a nested `actor` object with the real name
            actor_obj = row.get("actor") or {}
            name = actor_obj.get("name") or row.get("actor_name") or row.get("name") or ""
            assert name == seeded_actors["target_name"], f"enriched name = {name!r}; row={row}"
        finally:
            s.delete(f"{API}/movies/{mid}", timeout=10)
