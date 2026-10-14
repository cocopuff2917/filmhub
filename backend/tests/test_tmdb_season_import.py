import asyncio
from types import SimpleNamespace

from bson import ObjectId

from backend import server


class FakeSeriesCollection:
    def __init__(self, series):
        self.series = series

    async def find_one(self, query):
        return self.series


class FakeActorCursor:
    def __init__(self, actors):
        self.actors = actors

    def __aiter__(self):
        async def iterate():
            for actor in self.actors:
                yield actor

        return iterate()


class FakeActorCollection:
    def __init__(self, actors):
        self.actors = actors

    def find(self, query, projection):
        requested_ids = set(query["_id"]["$in"])
        return FakeActorCursor([actor for actor in self.actors if actor["_id"] in requested_ids])


class FakeImportJobsCollection:
    def __init__(self):
        self.jobs = {}

    async def insert_one(self, job):
        self.jobs[job["_id"]] = job

    async def find_one(self, query):
        job = self.jobs.get(query["_id"])
        if job and job.get("series_id") == query["series_id"]:
            return job
        return None

    async def update_one(self, query, update):
        self.jobs[query["_id"]].update(update["$set"])


class FakeBackgroundTasks:
    def __init__(self):
        self.task = None

    def add_task(self, function, *args):
        self.task = (function, args)


def test_tmdb_season_import_returns_episode_cast_without_descriptions_or_images(monkeypatch):
    series_id = ObjectId()
    main_actor_id = ObjectId()
    series = {
        "_id": series_id,
        "title": "Test Series",
        "tmdb_id": 900,
        "main_cast": [{"actor_id": str(main_actor_id), "character_name": "Lead"}],
        "seasons": [],
    }
    monkeypatch.setattr(server, "db", SimpleNamespace(
        series=FakeSeriesCollection(series),
        actors=FakeActorCollection([{
            "_id": main_actor_id,
            "tmdb_id": 700,
            "name": "Main Person",
        }]),
    ))
    monkeypatch.setattr(server, "_ensure_content_edits_allowed", lambda user: asyncio.sleep(0))
    monkeypatch.setattr(server, "_tmdb_import_is_enabled", lambda: asyncio.sleep(0, result=True))
    monkeypatch.setattr(server, "_check_locks", lambda *args: None)
    monkeypatch.setattr(server, "_tmdb_match_id", lambda *args: asyncio.sleep(0, result=900))
    monkeypatch.setattr(server, "_ensure_tmdb_bot_user", lambda: asyncio.sleep(0, result={"id": "bot"}))
    monkeypatch.setattr(server, "_tmdb_actor_id", lambda person, bot: asyncio.sleep(0, result="guest-actor-id"))

    async def fake_tmdb_request(path, params=None):
        if path == "/tv/900":
            return {"seasons": [{"season_number": 1, "name": "Season 1", "air_date": "2020-01-01"}]}
        if path == "/tv/900/season/1":
            return {
                "name": "Season 1",
                "air_date": "2020-01-01",
                "overview": "Must not be imported",
                "poster_path": "/must-not-be-imported.jpg",
                "episodes": [{
                    "episode_number": 1,
                    "name": "Pilot",
                    "air_date": "2020-01-02",
                    "overview": "Must not be imported",
                    "still_path": "/must-not-be-imported.jpg",
                    "guest_stars": [{"id": 701, "name": "Guest Person", "character": "Guest"}],
                }],
            }
        if path == "/tv/900/season/1/episode/1/credits":
            return {"cast": [{"id": 700, "name": "Main Person", "character": "Lead"}]}
        raise AssertionError(f"Unexpected TMDB path: {path}")

    monkeypatch.setattr(server, "_tmdb_request", fake_tmdb_request)

    result = asyncio.run(server._import_series_seasons_from_tmdb(
        str(series_id),
        user={"id": "editor", "role": "user"},
    ))

    assert result["seasons"] == [{
        "season_number": 1,
        "name": "Season 1",
        "air_date": "2020-01-01",
        "episodes": [{
            "episode_number": 1,
            "title": "Pilot",
            "air_date": "2020-01-02",
            "main_cast_actor_ids": [str(main_actor_id)],
            "guest_stars": [{"actor_id": "guest-actor-id", "character_name": "Guest"}],
        }],
    }]
    assert result["actors"] == [{"id": "guest-actor-id", "name": "Guest Person"}]


def test_tmdb_season_import_runs_as_background_job(monkeypatch):
    series_id = str(ObjectId())
    import_jobs = FakeImportJobsCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(tmdb_import_jobs=import_jobs))

    async def fake_import(series_id, user):
        return {"seasons": [{"season_number": 1, "episodes": []}], "actors": []}

    monkeypatch.setattr(server, "_import_series_seasons_from_tmdb", fake_import)
    background_tasks = FakeBackgroundTasks()
    user = {"id": "moderator", "role": "moderator"}

    started = asyncio.run(server.import_series_seasons_from_tmdb(series_id, background_tasks, user))

    assert started["status"] == "queued"
    assert import_jobs.jobs[started["job_id"]]["status"] == "queued"
    assert background_tasks.task[0] is server._run_tmdb_season_import_job

    task, arguments = background_tasks.task
    asyncio.run(task(*arguments))
    status = asyncio.run(server.get_tmdb_season_import_status(series_id, started["job_id"], user))

    assert status == {
        "status": "completed",
        "result": {"seasons": [{"season_number": 1, "episodes": []}], "actors": []},
        "error": None,
    }


def test_only_mods_and_admins_can_delete_seasons_or_episodes():
    existing = [{
        "season_number": 1,
        "episodes": [{"episode_number": 1, "title": "Pilot"}],
    }]
    user = {"role": "user", "effective_role": "user", "permissions": ["content.delete"]}

    assert server._enforce_season_episode_integrity(existing, [], user) == existing


def test_non_mods_cannot_mark_final_season():
    existing = [
        {"season_number": 1, "episodes": [], "is_last_season": False},
        {"season_number": 2, "episodes": [], "is_last_season": True},
    ]
    user = {"role": "user", "effective_role": "user", "permissions": []}

    updated = [{"season_number": 1, "episodes": [], "is_last_season": True}, {"season_number": 2, "episodes": [], "is_last_season": False}]
    result = server._enforce_final_season_guard(existing, updated, user)

    assert result[0]["is_last_season"] is False
    assert result[1]["is_last_season"] is True


def test_tmdb_actor_id_does_not_backfill_missing_photo_from_tmdb(monkeypatch):
    created = {}

    class FakeActorCollection:
        def __init__(self):
            self.inserted = None

        async def find_one(self, query):
            return None

        def find(self, query):
            return SimpleNamespace(to_list=self._to_list)

        async def _to_list(self, limit):
            return []

        async def insert_one(self, doc):
            created.update(doc)
            return SimpleNamespace(inserted_id=ObjectId())

    monkeypatch.setattr(server, "db", SimpleNamespace(actors=FakeActorCollection()))

    async def fake_log_edit(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "log_edit", fake_log_edit)

    actor_id = asyncio.run(server._tmdb_actor_id({
        "id": 123,
        "name": "New Actor",
        "profile_path": "/profile.jpg",
        "biography": "",
    }, {"id": "bot"}))

    assert actor_id is not None
    assert created["photo_url"] == ""
    assert created["tmdb_id"] == 123