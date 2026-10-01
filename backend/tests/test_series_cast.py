"""Tests for Series Cast enrichment: episode_count per cast member, recurring guest-star promotion
(threshold=5), and collection_ids parity with movies.

Spec being tested:
- GET /api/series/{id} returns collection_ids (list, may be empty).
- Each main_cast entry has `episode_count` (int). For original main_cast = total series episode_count.
- Guest stars appearing in >=5 distinct episodes AND not already in main_cast are promoted into
  main_cast with recurring=True, episode_count=count, appended after original main_cast and sorted
  by episode_count desc.
- Guest stars with <5 appearances are NOT promoted.
- An actor who is both in main_cast and a guest_star in some episodes is not duplicated; their
  original episode_count (total episodes) wins.
"""
import os
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASSWORD = "Admin@123"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_ids():
    """Container for ids to clean up at module teardown."""
    return {"actors": [], "series": [], "movies": [], "collections": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_session, created_ids):
    yield
    for sid in created_ids["series"]:
        try:
            admin_session.delete(f"{API}/series/{sid}", timeout=15)
        except Exception:
            pass
    for mid in created_ids["movies"]:
        try:
            admin_session.delete(f"{API}/movies/{mid}", timeout=15)
        except Exception:
            pass
    for aid in created_ids["actors"]:
        try:
            admin_session.delete(f"{API}/actors/{aid}", timeout=15)
        except Exception:
            pass
    for cid in created_ids["collections"]:
        try:
            admin_session.delete(f"{API}/collections/{cid}", timeout=15)
        except Exception:
            pass


def _make_actor(admin_session, created_ids, name):
    r = admin_session.post(f"{API}/actors", json={"name": f"TEST_{name}", "bio": ""}, timeout=15)
    assert r.status_code in (200, 201), f"actor create failed: {r.status_code} {r.text}"
    aid = r.json().get("id")
    assert aid
    created_ids["actors"].append(aid)
    return aid


def _episodes(count, guest_actor_ids_per_ep):
    """Return list of episode dicts with guest_stars. guest_actor_ids_per_ep is list[list[(aid, char)]]."""
    eps = []
    for i in range(count):
        guests = []
        for aid, char in guest_actor_ids_per_ep[i]:
            guests.append({"actor_id": aid, "character_name": char})
        eps.append({
            "episode_number": i + 1,
            "name": f"Ep {i+1}",
            "overview": "",
            "guest_stars": guests,
        })
    return eps


# ---------- tests ----------

# Feature: collection_ids parity on GET /api/series/{id}
def test_series_get_includes_collection_ids(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "Lead1")
    payload = {
        "title": "TEST_Series_CollectionIds",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": [{"episode_number": 1, "name": "P", "guest_stars": []}]}],
    }
    r = admin_session.post(f"{API}/series", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    g = admin_session.get(f"{API}/series/{sid}", timeout=15)
    assert g.status_code == 200
    data = g.json()
    assert "collection_ids" in data, "collection_ids missing from series response"
    assert isinstance(data["collection_ids"], list)
    assert data["collection_ids"] == []


# Feature: episode_count on each main_cast entry equals series total
def test_main_cast_entries_have_episode_count_equal_to_total(admin_session, created_ids):
    a1 = _make_actor(admin_session, created_ids, "LeadA")
    a2 = _make_actor(admin_session, created_ids, "LeadB")
    seasons = [{
        "season_number": 1,
        "episodes": [{"episode_number": i+1, "name": f"E{i+1}", "guest_stars": []} for i in range(3)],
    }]
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_MainCastCount",
        "main_cast": [
            {"actor_id": a1, "character_name": "A"},
            {"actor_id": a2, "character_name": "B"},
        ],
        "seasons": seasons,
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert data["episode_count"] == 3
    assert len(data["main_cast"]) == 2
    for c in data["main_cast"]:
        assert c.get("episode_count") == 3, f"expected 3, got {c}"
        assert not c.get("recurring")
    # order preserved
    assert data["main_cast"][0]["actor"]["id"] == a1
    assert data["main_cast"][1]["actor"]["id"] == a2


# Feature: guest star with >=5 episode appearances is promoted to main_cast as recurring
def test_recurring_guest_promoted_at_threshold_6_episodes(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadC")
    guest = _make_actor(admin_session, created_ids, "GuestC")
    # 6 episodes, each with guest
    eps = _episodes(6, [[(guest, "Buddy")] for _ in range(6)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_RecurringPromo6",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert data["episode_count"] == 6
    assert len(data["main_cast"]) == 2, f"expected 2, got {data['main_cast']}"
    # original first
    assert data["main_cast"][0]["actor"]["id"] == lead
    assert data["main_cast"][0]["episode_count"] == 6
    assert not data["main_cast"][0].get("recurring")
    # recurring appended
    rec = data["main_cast"][1]
    assert rec["actor"]["id"] == guest
    assert rec["episode_count"] == 6
    assert rec["recurring"] is True
    assert rec.get("character_name") == "Buddy"


# Feature: guest star with <5 episode appearances is NOT promoted
def test_guest_below_threshold_not_promoted(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadD")
    guest = _make_actor(admin_session, created_ids, "GuestD")
    # 4 episodes with guest (below threshold)
    eps = _episodes(4, [[(guest, "Pal")] for _ in range(4)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_BelowThreshold4",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert data["episode_count"] == 4
    assert len(data["main_cast"]) == 1, f"guest should not be promoted; got {data['main_cast']}"
    assert data["main_cast"][0]["actor"]["id"] == lead
    assert data["main_cast"][0]["episode_count"] == 4


# Feature: an actor in main_cast + also guest_star should NOT be duplicated; original wins
def test_actor_in_main_and_guest_not_duplicated(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadE")
    # lead is also a guest star in episodes
    eps = _episodes(6, [[(lead, "AltName")] for _ in range(6)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_NoDup",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    mc = data["main_cast"]
    ids = [c["actor"]["id"] for c in mc]
    assert ids.count(lead) == 1, f"actor duplicated: {ids}"
    assert len(mc) == 1
    assert mc[0]["episode_count"] == 6  # total episodes wins over guest count (also 6, same here)
    assert not mc[0].get("recurring")


# Feature: ordering — originals first in input order, recurring sorted by episode_count desc
def test_ordering_originals_then_recurring_sorted_desc(admin_session, created_ids):
    lead1 = _make_actor(admin_session, created_ids, "O1")
    lead2 = _make_actor(admin_session, created_ids, "O2")
    gA = _make_actor(admin_session, created_ids, "GA")  # 5 eps
    gB = _make_actor(admin_session, created_ids, "GB")  # 7 eps
    gC = _make_actor(admin_session, created_ids, "GC")  # 6 eps
    gLow = _make_actor(admin_session, created_ids, "GLow")  # 3 eps (should NOT appear)

    # Build 10 episodes with varying guests
    per_ep = []
    for i in range(10):
        row = []
        if i < 7:
            row.append((gB, "B"))
        if i < 6:
            row.append((gC, "C"))
        if i < 5:
            row.append((gA, "A"))
        if i < 3:
            row.append((gLow, "L"))
        per_ep.append(row)
    eps = _episodes(10, per_ep)

    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_Ordering",
        "main_cast": [
            {"actor_id": lead1, "character_name": "O1"},
            {"actor_id": lead2, "character_name": "O2"},
        ],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    mc = data["main_cast"]
    ids = [c["actor"]["id"] for c in mc]
    # Expected: lead1, lead2, gB(7), gC(6), gA(5). gLow(3) excluded.
    assert ids == [lead1, lead2, gB, gC, gA], f"ordering wrong: {ids}"
    assert mc[0]["episode_count"] == 10 and not mc[0].get("recurring")
    assert mc[1]["episode_count"] == 10 and not mc[1].get("recurring")
    assert mc[2]["episode_count"] == 7 and mc[2]["recurring"] is True
    assert mc[3]["episode_count"] == 6 and mc[3]["recurring"] is True
    assert mc[4]["episode_count"] == 5 and mc[4]["recurring"] is True
    assert gLow not in ids


# Regression: collection_ids still works on create series + GET returns it
def test_collection_ids_create_regression(admin_session, created_ids):
    # Create a collection
    r = admin_session.post(f"{API}/collections", json={"name": "TEST_CollSeriesCast", "description": ""}, timeout=15)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    created_ids["collections"].append(cid)

    lead = _make_actor(admin_session, created_ids, "LeadF")
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_WithColl",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": [{"episode_number": 1, "name": "e", "guest_stars": []}]}],
        "collection_ids": [cid],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert cid in (data.get("collection_ids") or []), f"collection_ids: {data.get('collection_ids')}"
