"""Tests for Series Cast enrichment: episode_count per cast member, guest-star separation,
and collection_ids parity with movies.

Spec being tested:
- GET /api/series/{id} returns collection_ids (list, may be empty).
- Each main_cast entry has `episode_count` (int). For original main_cast = total series episode_count.
- Guest stars are never promoted into main_cast, regardless of episode appearance count.
- An actor who is both in main_cast and a guest_star in some episodes is not duplicated; their
  original episode_count (total episodes) wins.
"""
import os
import uuid
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
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
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
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
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
        assert c.get("episode_appearance_count") == 0, f"expected no episode selections by default, got {c}"
        assert not c.get("recurring")
    # order preserved
    assert data["main_cast"][0]["actor"]["id"] == a1
    assert data["main_cast"][1]["actor"]["id"] == a2


def test_main_cast_is_assigned_to_episodes_not_seasons(admin_session, created_ids):
    actor = _make_actor(admin_session, created_ids, "EpisodeOnlyRegular")
    created = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_EpisodeOnlyCast",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": actor, "character_name": "Episode Regular"}],
        "seasons": [
            {"season_number": 1, "episodes": [
                {"episode_number": 1, "name": "Appears", "main_cast_actor_ids": [actor]},
                {"episode_number": 2, "name": "Absent", "main_cast_actor_ids": []},
            ]},
            {"season_number": 2, "episodes": [
                {"episode_number": 1, "name": "Returns", "main_cast_actor_ids": [actor]},
            ]},
        ],
    }, timeout=20)
    assert created.status_code in (200, 201), created.text
    series_id = created.json()["id"]
    created_ids["series"].append(series_id)

    data = admin_session.get(f"{API}/series/{series_id}", timeout=15).json()
    assert all(not season.get("main_cast") for season in data["seasons"])
    assert data["seasons"][0]["episodes"][0]["main_cast_members"][0]["actor"]["id"] == actor
    assert data["seasons"][0]["episodes"][1]["main_cast_actor_ids"] == []
    assert data["seasons"][1]["episodes"][0]["main_cast_members"][0]["actor"]["id"] == actor
    cast_credit = next(member for member in data["main_cast"] if member["actor"]["id"] == actor)
    assert cast_credit["episode_appearance_count"] == 2


# Feature: guest star with >=5 episode appearances remains separate from main_cast
def test_recurring_guest_not_promoted_at_threshold_6_episodes(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadC")
    guest = _make_actor(admin_session, created_ids, "GuestC")
    # 6 episodes, each with guest
    eps = _episodes(6, [[(guest, "Buddy")] for _ in range(6)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_RecurringPromo6",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert data["episode_count"] == 6
    assert len(data["main_cast"]) == 1, f"guest should remain separate; got {data['main_cast']}"
    assert data["main_cast"][0]["actor"]["id"] == lead
    assert data["main_cast"][0]["episode_count"] == 6
    assert not data["main_cast"][0].get("recurring")
    assert guest not in [member["actor"]["id"] for member in data["main_cast"]]
    assert all(ep["guest_stars"][0]["actor"]["id"] == guest for ep in data["seasons"][0]["episodes"])


# Feature: guest star with <5 episode appearances is NOT promoted
def test_guest_below_threshold_not_promoted(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadD")
    guest = _make_actor(admin_session, created_ids, "GuestD")
    # 4 episodes with guest (below threshold)
    eps = _episodes(4, [[(guest, "Pal")] for _ in range(4)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_BelowThreshold4",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
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


# Feature: episode guest-star classification takes precedence over series main_cast
def test_actor_in_main_and_guest_not_duplicated(admin_session, created_ids):
    lead = _make_actor(admin_session, created_ids, "LeadE")
    # lead is also a guest star in episodes
    eps = _episodes(6, [[(lead, "AltName")] for _ in range(6)])
    r = admin_session.post(f"{API}/series", json={
        "title": "TEST_Series_NoDup",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": eps}],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    mc = data["main_cast"]
    ids = [c["actor"]["id"] for c in mc]
    assert lead not in ids, f"guest actor should not appear in main cast: {ids}"
    assert all(
        guest["actor"]["id"] == lead
        for episode in data["seasons"][0]["episodes"]
        for guest in episode["guest_stars"]
    )
    assert all(lead not in episode["main_cast_actor_ids"] for episode in data["seasons"][0]["episodes"])


# Feature: guest stars at and above the threshold never enter the main-cast order
def test_ordering_contains_only_original_main_cast(admin_session, created_ids):
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
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
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
    # Main-cast order preserves only the explicitly configured members.
    assert ids == [lead1, lead2], f"unexpected guest in main cast: {ids}"
    assert mc[0]["episode_count"] == 10 and not mc[0].get("recurring")
    assert mc[1]["episode_count"] == 10 and not mc[1].get("recurring")
    assert not {gA, gB, gC, gLow}.intersection(ids)


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
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": lead, "character_name": "Lead"}],
        "seasons": [{"season_number": 1, "episodes": [{"episode_number": 1, "name": "e", "guest_stars": []}]}],
        "collection_ids": [cid],
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]
    created_ids["series"].append(sid)

    data = admin_session.get(f"{API}/series/{sid}", timeout=15).json()
    assert cid in (data.get("collection_ids") or []), f"collection_ids: {data.get('collection_ids')}"


def test_network_filter_and_related_series(admin_session, created_ids):
    network = f"TEST Network {uuid.uuid4().hex}"
    series_ids = {}
    for key, title, show_network, air_date in [
        ("base", "NetworkBase", network, "1980-01-01"),
        ("same", "NetworkMatch", network, "2025-01-01"),
        ("other", "NetworkOther", f"Other {network}", "2025-01-01"),
    ]:
        response = admin_session.post(f"{API}/series", json={
            "title": f"TEST_{title}_{uuid.uuid4().hex}",
            "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
            "network": show_network,
            "first_air_date": air_date,
        }, timeout=20)
        assert response.status_code in (200, 201), response.text
        series_ids[key] = response.json()["id"]
        created_ids["series"].append(series_ids[key])

    choices = admin_session.get(f"{API}/series/networks", timeout=15)
    assert choices.status_code == 200, choices.text
    assert network in choices.json()

    filtered = admin_session.get(f"{API}/series", params={"network": network.swapcase()}, timeout=15)
    assert filtered.status_code == 200, filtered.text
    filtered_ids = {item["id"] for item in filtered.json()}
    assert series_ids["base"] in filtered_ids
    assert series_ids["same"] in filtered_ids
    assert series_ids["other"] not in filtered_ids

    related = admin_session.get(f"{API}/series/{series_ids['base']}/similar", timeout=15)
    assert related.status_code == 200, related.text
    related_ids = {item["id"] for item in related.json()}
    assert series_ids["same"] in related_ids
    assert series_ids["other"] not in related_ids


def test_linked_movie_crew_appears_on_actor_profile(admin_session, created_ids):
    actor_id = _make_actor(admin_session, created_ids, "MakeupArtist")
    response = admin_session.post(f"{API}/movies", json={
        "title": f"TEST_CrewCredit_{uuid.uuid4().hex}",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "release_date": "2025-01-01",
        "crew": [{"actor_id": actor_id, "name": "", "role": "Makeup Artist"}],
    }, timeout=20)
    assert response.status_code in (200, 201), response.text
    movie_id = response.json()["id"]
    created_ids["movies"].append(movie_id)

    movie = admin_session.get(f"{API}/movies/{movie_id}", timeout=15).json()
    assert movie["crew"][0]["actor"]["id"] == actor_id
    assert movie["crew"][0]["role"] == "Makeup Artist"

    actor = admin_session.get(f"{API}/actors/{actor_id}", timeout=15).json()
    assert any(credit["id"] == movie_id and credit["role"] == "Makeup Artist" for credit in actor["crew_credits"])


def test_episode_main_cast_selection_appears_on_actor_profile(admin_session, created_ids):
    actor_id = _make_actor(admin_session, created_ids, "EpisodeRegular")
    response = admin_session.post(f"{API}/series", json={
        "title": f"TEST_EpisodeMainCast_{uuid.uuid4().hex}",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": actor_id, "character_name": "Regular"}],
        "seasons": [
            {"season_number": 1, "episodes": [
                {"episode_number": 1, "name": "Pilot", "main_cast_actor_ids": [actor_id]},
                    {"episode_number": 2, "name": "Absent", "main_cast_actor_ids": []},
                {"episode_number": 3, "name": "Return", "main_cast_actor_ids": [actor_id]},
            ]},
            {"season_number": 2, "episodes": [
                {"episode_number": 1, "name": "Season two appearance", "main_cast_actor_ids": [actor_id]},
            ]},
        ],
    }, timeout=20)
    assert response.status_code in (200, 201), response.text
    series_id = response.json()["id"]
    created_ids["series"].append(series_id)

    series = admin_session.get(f"{API}/series/{series_id}", timeout=15).json()
    first_season_episodes = series["seasons"][0]["episodes"]
    cast_credit = next(member for member in series["main_cast"] if member["actor"]["id"] == actor_id)
    assert cast_credit["episode_appearance_count"] == 3
    assert first_season_episodes[0]["main_cast_members"][0]["actor"]["id"] == actor_id
    assert first_season_episodes[1]["main_cast_actor_ids"] == []
    assert series["seasons"][1]["episodes"][0]["main_cast_actor_ids"] == [actor_id]

    actor = admin_session.get(f"{API}/actors/{actor_id}", timeout=15).json()
    episode_numbers = [credit["episode_number"] for credit in actor["main_cast_episodes"]]
    episode_coordinates = [(credit["season_number"], credit["episode_number"]) for credit in actor["main_cast_episodes"]]
    assert episode_coordinates == [(1, 1), (1, 3), (2, 1)]

    updated = admin_session.patch(
        f"{API}/series/{series_id}/seasons/1/episodes/2/main-cast",
        json={"main_cast_actor_ids": [actor_id]},
        timeout=20,
    )
    assert updated.status_code == 200, updated.text
    second_episode = updated.json()["seasons"][0]["episodes"][1]
    assert second_episode["main_cast_members"][0]["actor"]["id"] == actor_id
    cast_credit = next(member for member in updated.json()["main_cast"] if member["actor"]["id"] == actor_id)
    assert cast_credit["episode_appearance_count"] == 4

    invalid_assignment = admin_session.patch(
        f"{API}/series/{series_id}/seasons/2/episodes/1/main-cast",
        json={"main_cast_actor_ids": [actor_id]},
        timeout=20,
    )
    assert invalid_assignment.status_code == 200, invalid_assignment.text
    assert invalid_assignment.json()["seasons"][1]["episodes"][0]["main_cast_actor_ids"] == [actor_id]

    actor = admin_session.get(f"{API}/actors/{actor_id}", timeout=15).json()
    episode_coordinates = [(credit["season_number"], credit["episode_number"]) for credit in actor["main_cast_episodes"]]
    assert episode_coordinates == [(1, 1), (1, 2), (1, 3), (2, 1)]

    lock_response = admin_session.post(
        f"{API}/series/{series_id}/main-cast-episode-lock",
        json={"season_number": 1, "episode_number": 1},
        timeout=15,
    )
    assert lock_response.status_code == 200, lock_response.text
    assert "1:1" in lock_response.json()["locked_main_cast_episodes"]

    unlock_response = admin_session.post(
        f"{API}/series/{series_id}/main-cast-episode-lock",
        json={"season_number": 1, "episode_number": 1},
        timeout=15,
    )
    assert unlock_response.status_code == 200, unlock_response.text
    assert "1:1" not in unlock_response.json()["locked_main_cast_episodes"]


def test_episode_guest_stars_can_be_edited(admin_session, created_ids):
    actor_id = _make_actor(admin_session, created_ids, "EpisodeGuest")
    response = admin_session.post(f"{API}/series", json={
        "title": f"TEST_EpisodeGuestStars_{uuid.uuid4().hex}",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": actor_id, "character_name": "Previously Main"}],
        "seasons": [{"season_number": 1, "episodes": [
            {"episode_number": 1, "name": "Pilot", "guest_stars": []},
            {"episode_number": 2, "name": "Finale", "guest_stars": []},
        ]}],
    }, timeout=20)
    assert response.status_code in (200, 201), response.text
    series_id = response.json()["id"]
    created_ids["series"].append(series_id)

    updated = admin_session.patch(
        f"{API}/series/{series_id}/seasons/1/episodes/1/guest-stars",
        json={"guest_stars": [{"actor_id": actor_id, "character_name": "Mystery Guest"}]},
        timeout=20,
    )
    assert updated.status_code == 200, updated.text
    episodes = updated.json()["seasons"][0]["episodes"]
    assert episodes[0]["guest_stars"][0]["actor"]["id"] == actor_id
    assert episodes[0]["guest_stars"][0]["character_name"] == "Mystery Guest"
    assert episodes[1]["guest_stars"] == []
    assert all(member["actor"]["id"] != actor_id for member in updated.json()["main_cast"])
    assert actor_id not in episodes[0]["main_cast_actor_ids"]

    edited = admin_session.patch(
        f"{API}/series/{series_id}/seasons/1/episodes/1/guest-stars",
        json={"guest_stars": [{"actor_id": actor_id, "character_name": "Updated Character"}]},
        timeout=20,
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["seasons"][0]["episodes"][0]["guest_stars"][0]["character_name"] == "Updated Character"


def test_episode_details_can_be_edited_without_changing_credits(admin_session, created_ids):
    regular_actor = _make_actor(admin_session, created_ids, "DetailsRegular")
    guest_actor = _make_actor(admin_session, created_ids, "DetailsGuest")
    response = admin_session.post(f"{API}/series", json={
        "title": f"TEST_EpisodeDetails_{uuid.uuid4().hex}",
        "imdb_id": f"tt{uuid.uuid4().int % 10**7:07d}",
        "main_cast": [{"actor_id": regular_actor, "character_name": "Regular"}],
        "seasons": [{"season_number": 1, "episodes": [
            {
                "episode_number": 1,
                "name": "Original title",
                "overview": "Original overview",
                "main_cast_actor_ids": [regular_actor],
                "guest_stars": [{"actor_id": guest_actor, "character_name": "Guest"}],
            },
            {"episode_number": 2, "name": "Untouched episode", "overview": "Keep this"},
        ]}],
    }, timeout=20)
    assert response.status_code in (200, 201), response.text
    series_id = response.json()["id"]
    created_ids["series"].append(series_id)

    updated = admin_session.patch(
        f"{API}/series/{series_id}/seasons/1/episodes/1/details",
        json={
            "name": "Updated title",
            "air_date": "2026-10-09",
            "overview": "Updated overview",
            "still_url": "/uploads/episode-still.jpg",
            "stills": ["/uploads/episode-still.jpg", "/uploads/episode-still-2.jpg"],
        },
        timeout=20,
    )
    assert updated.status_code == 200, updated.text
    first, second = updated.json()["seasons"][0]["episodes"]
    assert first["name"] == "Updated title"
    assert first["air_date"] == "2026-10-09"
    assert first["overview"] == "Updated overview"
    assert first["still_url"] == "/uploads/episode-still.jpg"
    assert first["stills"] == ["/uploads/episode-still.jpg", "/uploads/episode-still-2.jpg"]
    assert first["main_cast_actor_ids"] == [regular_actor]
    assert first["guest_stars"][0]["actor"]["id"] == guest_actor
    assert second["name"] == "Untouched episode"
    assert second["overview"] == "Keep this"
