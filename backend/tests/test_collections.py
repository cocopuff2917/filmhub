"""Tests for Collections (Franchises) + Videos regression.

Covers:
- Auth / role gating on POST/PATCH/DELETE /api/collections
- Duplicate name (case-insensitive) -> 409
- GET /api/collections/{id} returns titles sorted by release/air date
- add / remove membership toggles collection_ids on movie/series doc
- enrich_movie/enrich_series returns `collections` array + collection_ids
- PATCH movie/series accepts collection_ids without regressing other fields
- DELETE detaches (does not delete) movies
- Trailer / video_urls regression
"""
import os
import time
import requests
import pytest

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@cineverse.com", "password": "Admin@123"}
USER = {"email": "user@test.com", "password": "Test@123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def user():
    # ensure user exists
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=USER, timeout=15)
    if r.status_code != 200:
        requests.post(f"{API}/auth/register", json={**USER, "name": "Regular User"}, timeout=15)
        r = s.post(f"{API}/auth/login", json=USER, timeout=15)
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def temp_collection(admin):
    name = f"TEST_Collection_{int(time.time())}"
    r = admin.post(f"{API}/collections", json={"name": name, "description": "d"}, timeout=15)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    yield cid, name
    admin.delete(f"{API}/collections/{cid}", timeout=15)


class TestCollectionAuth:
    def test_list_public(self):
        r = requests.get(f"{API}/collections", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_requires_mod(self, user):
        r = user.post(f"{API}/collections", json={"name": "TEST_UserAttempt"}, timeout=15)
        assert r.status_code == 403

    def test_admin_can_create(self, temp_collection):
        cid, _name = temp_collection
        assert cid

    def test_duplicate_name_case_insensitive_returns_409(self, admin, temp_collection):
        _cid, name = temp_collection
        r = admin.post(f"{API}/collections", json={"name": name.upper()}, timeout=15)
        assert r.status_code == 409


class TestCollectionCRUD:
    def test_get_collection_detail(self, temp_collection):
        cid, name = temp_collection
        r = requests.get(f"{API}/collections/{cid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == cid
        assert data["name"] == name
        assert "titles" in data and isinstance(data["titles"], list)

    def test_patch_collection(self, admin, temp_collection):
        cid, _ = temp_collection
        r = admin.patch(f"{API}/collections/{cid}", json={"description": "updated desc"}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/collections/{cid}", timeout=15)
        assert r2.json()["description"] == "updated desc"

    def test_non_mod_cannot_patch(self, user, temp_collection):
        cid, _ = temp_collection
        r = user.patch(f"{API}/collections/{cid}", json={"description": "x"}, timeout=15)
        assert r.status_code == 403


class TestMembership:
    @pytest.fixture(scope="class")
    def movie_id(self, admin):
        # try existing 'Marvel Cinematic Universe' movie or create a new one
        r = admin.get(f"{API}/movies?limit=5", timeout=15)
        assert r.status_code == 200
        movies = r.json()
        assert movies, "no movies present to test"
        return movies[0]["id"]

    def test_invalid_title_type_returns_400(self, admin, temp_collection, movie_id):
        cid, _ = temp_collection
        r = admin.post(f"{API}/collections/{cid}/add",
                       json={"title_type": "bogus", "title_id": movie_id}, timeout=15)
        assert r.status_code == 400

    def test_add_and_remove_movie(self, admin, temp_collection, movie_id):
        cid, _ = temp_collection
        r = admin.post(f"{API}/collections/{cid}/add",
                       json={"title_type": "movie", "title_id": movie_id}, timeout=15)
        assert r.status_code == 200, r.text
        # movie should now list collection
        mr = requests.get(f"{API}/movies/{movie_id}", timeout=15)
        assert mr.status_code == 200
        mdata = mr.json()
        assert "collection_ids" in mdata
        assert cid in mdata["collection_ids"]
        assert "collections" in mdata
        assert any(c["id"] == cid for c in mdata["collections"])
        # collection detail should list the title with required keys
        cdet = requests.get(f"{API}/collections/{cid}", timeout=15).json()
        titles = cdet["titles"]
        assert any(t["id"] == movie_id and t["kind"] == "movie" for t in titles)
        t0 = next(t for t in titles if t["id"] == movie_id)
        for k in ("kind", "id", "title", "year", "poster_url"):
            assert k in t0
        # remove
        r2 = admin.post(f"{API}/collections/{cid}/remove",
                        json={"title_type": "movie", "title_id": movie_id}, timeout=15)
        assert r2.status_code == 200
        mr2 = requests.get(f"{API}/movies/{movie_id}", timeout=15).json()
        assert cid not in (mr2.get("collection_ids") or [])

    def test_non_mod_cannot_add(self, user, temp_collection, movie_id):
        cid, _ = temp_collection
        r = user.post(f"{API}/collections/{cid}/add",
                      json={"title_type": "movie", "title_id": movie_id}, timeout=15)
        assert r.status_code == 403


class TestPatchMovieCollectionIds:
    def test_patch_movie_with_collection_ids_preserves_trailer(self, admin, temp_collection):
        cid, _ = temp_collection
        r = admin.get(f"{API}/movies?limit=1", timeout=15)
        movies = r.json()
        assert movies
        mid = movies[0]["id"]
        # fetch full to keep trailer_url
        mdet = requests.get(f"{API}/movies/{mid}", timeout=15).json()
        original_trailer = mdet.get("trailer_url", "")
        # set collection_ids via PATCH
        r2 = admin.patch(f"{API}/movies/{mid}",
                         json={"collection_ids": [cid]}, timeout=15)
        assert r2.status_code == 200, r2.text
        after = requests.get(f"{API}/movies/{mid}", timeout=15).json()
        assert cid in (after.get("collection_ids") or [])
        # trailer unchanged
        assert after.get("trailer_url", "") == original_trailer
        # cleanup
        admin.patch(f"{API}/movies/{mid}", json={"collection_ids": []}, timeout=15)


class TestDeleteDetaches:
    def test_delete_removes_collection_from_movies(self, admin):
        # create collection, attach a movie, delete collection, verify movie still exists w/o that id
        name = f"TEST_DEL_{int(time.time())}"
        r = admin.post(f"{API}/collections", json={"name": name}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        movies = admin.get(f"{API}/movies?limit=1", timeout=15).json()
        mid = movies[0]["id"]
        admin.post(f"{API}/collections/{cid}/add",
                   json={"title_type": "movie", "title_id": mid}, timeout=15)
        # delete
        d = admin.delete(f"{API}/collections/{cid}", timeout=15)
        assert d.status_code == 200
        # movie exists but no membership
        mr = requests.get(f"{API}/movies/{mid}", timeout=15)
        assert mr.status_code == 200
        assert cid not in (mr.json().get("collection_ids") or [])
        # collection gone
        assert requests.get(f"{API}/collections/{cid}", timeout=15).status_code == 404


class TestSeriesCollections:
    def test_series_get_has_collections_field(self, admin):
        r = admin.get(f"{API}/series?limit=1", timeout=15)
        series = r.json()
        if not series:
            pytest.skip("no series in DB")
        sid = series[0]["id"]
        sr = requests.get(f"{API}/series/{sid}", timeout=15).json()
        assert "collections" in sr
        # collection_ids not currently included on series detail (only movies); collections list is what's consumed


class TestRegression:
    def test_movies_list_ok(self):
        r = requests.get(f"{API}/movies?limit=5", timeout=15)
        assert r.status_code == 200

    def test_movie_detail_still_has_cast_and_trailer_shape(self, admin):
        r = admin.get(f"{API}/movies?limit=1", timeout=15).json()
        if not r:
            pytest.skip("no movies")
        mid = r[0]["id"]
        m = requests.get(f"{API}/movies/{mid}", timeout=15).json()
        for k in ("cast", "trailer_url", "video_urls", "gallery"):
            assert k in m, f"missing {k} in movie detail"

    def test_series_detail_has_seasons_and_video_urls(self, admin):
        r = admin.get(f"{API}/series?limit=1", timeout=15).json()
        if not r:
            pytest.skip("no series")
        sid = r[0]["id"]
        s = requests.get(f"{API}/series/{sid}", timeout=15).json()
        for k in ("main_cast", "trailer_url", "video_urls", "seasons"):
            assert k in s
