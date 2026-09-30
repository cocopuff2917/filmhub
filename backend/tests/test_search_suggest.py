"""Tests for /api/search/suggest typeahead endpoint (new feature)."""
import os
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://filmhub-918.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@cineverse.com"
ADMIN_PASS = "Admin@123"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    # login (search endpoint may or may not require auth, but login to be safe)
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return s


# -- Basic shape --
def test_suggest_returns_grouped_shape(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "a"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data.keys()) >= {"movies", "series", "actors"}
    for k in ("movies", "series", "actors"):
        assert isinstance(data[k], list)


def test_suggest_row_compact_shape(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "a"})
    data = r.json()
    rows = data["movies"] + data["series"] + data["actors"]
    if not rows:
        pytest.skip("No data returned to inspect row shape")
    for row in rows:
        assert set(row.keys()) >= {"id", "title", "poster_url", "year", "kind"}
        assert row["kind"] in ("movie", "series", "actor")
        assert isinstance(row["id"], str)
        assert isinstance(row["title"], str)


# -- Empty query --
def test_suggest_empty_query_returns_empty_lists(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": ""})
    assert r.status_code == 200
    data = r.json()
    assert data == {"movies": [], "series": [], "actors": []}


def test_suggest_whitespace_query_returns_empty(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "   "})
    assert r.status_code == 200
    data = r.json()
    assert data == {"movies": [], "series": [], "actors": []}


# -- Limit honored --
def test_suggest_default_limit_6(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "a"})
    data = r.json()
    for k in ("movies", "series", "actors"):
        assert len(data[k]) <= 6, f"{k} exceeded default limit 6"


def test_suggest_custom_limit(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "a", "limit": 2})
    data = r.json()
    for k in ("movies", "series", "actors"):
        assert len(data[k]) <= 2


# -- Regex escaping (should not 500 on special chars) --
@pytest.mark.parametrize("bad", ["(", ")", "[", "]", "?", "*", "+", "\\", ".*", "a(b"])
def test_suggest_regex_special_chars_safe(sess, bad):
    r = sess.get(f"{API}/search/suggest", params={"q": bad})
    assert r.status_code == 200, f"q={bad!r} -> {r.status_code}: {r.text}"


# -- Nonsense returns empty --
def test_suggest_nonsense_query(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "zzzzzzzzzqqqqqxx"})
    assert r.status_code == 200
    data = r.json()
    assert data["movies"] == [] and data["series"] == [] and data["actors"] == []


# -- Case-insensitive --
def test_suggest_case_insensitive(sess):
    r_lo = sess.get(f"{API}/search/suggest", params={"q": "a"}).json()
    r_hi = sess.get(f"{API}/search/suggest", params={"q": "A"}).json()
    # totals should be identical since case-insensitive regex
    assert len(r_lo["movies"]) == len(r_hi["movies"])
    assert len(r_lo["series"]) == len(r_hi["series"])
    assert len(r_lo["actors"]) == len(r_hi["actors"])


# -- Prefix bias: first result of each group should start with query if any prefix match exists --
def test_suggest_prefix_bias(sess):
    r = sess.get(f"{API}/search/suggest", params={"q": "a", "limit": 6}).json()
    for k in ("movies", "series", "actors"):
        items = r[k]
        if not items:
            continue
        has_prefix = any(x["title"].lower().startswith("a") for x in items)
        if has_prefix:
            assert items[0]["title"].lower().startswith("a"), f"{k}[0]={items[0]['title']!r} should be a prefix match"


# -- Deleted content must not appear --
def test_suggest_excludes_deleted_movie(sess):
    # Create a movie, verify it appears, soft-delete, verify it's gone.
    import uuid as _uuid
    unique = f"ZZUniqueSearchMovie_{_uuid.uuid4().hex[:8]}"
    payload = {"title": unique, "release_date": "2024-01-01", "genres": ["Drama"]}
    cr = sess.post(f"{API}/movies", json=payload)
    if cr.status_code not in (200, 201):
        pytest.skip(f"cannot create movie: {cr.status_code} {cr.text}")
    mid = cr.json().get("id")
    try:
        # Should appear in suggest
        r1 = sess.get(f"{API}/search/suggest", params={"q": unique}).json()
        titles = [m["title"] for m in r1["movies"]]
        assert unique in titles, f"created movie not in suggest: {titles}"
        # Delete
        dr = sess.delete(f"{API}/movies/{mid}")
        assert dr.status_code in (200, 204), dr.text
        # Should NOT appear
        r2 = sess.get(f"{API}/search/suggest", params={"q": unique}).json()
        titles2 = [m["title"] for m in r2["movies"]]
        assert unique not in titles2, f"deleted movie still in suggest: {titles2}"
    finally:
        # ensure cleanup
        try:
            sess.delete(f"{API}/movies/{mid}")
        except Exception:
            pass
