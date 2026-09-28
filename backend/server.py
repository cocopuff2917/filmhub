from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Query, Header
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, BeforeValidator
from bson import ObjectId

# ----------- Config -----------
JWT_ALGORITHM = "HS256"
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "cineverse"
storage_key: Optional[str] = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ----------- Object Storage -----------
def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        init_storage(force=True)
        key = storage_key
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": storage_key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ----------- Auth Helpers -----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 24), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ----------- Models -----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=80)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class CastMember(BaseModel):
    actor_id: str
    character_name: str

class MovieCreate(BaseModel):
    title: str
    release_date: str  # YYYY-MM-DD
    genres: List[str] = []
    synopsis: str = ""
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    runtime: Optional[int] = None
    gallery: List[str] = []
    cast: List[CastMember] = []
    is_trending: bool = False

class MovieUpdate(BaseModel):
    title: Optional[str] = None
    release_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    runtime: Optional[int] = None
    gallery: Optional[List[str]] = None
    cast: Optional[List[CastMember]] = None
    is_trending: Optional[bool] = None

class ActorCreate(BaseModel):
    name: str
    bio: str = ""
    photo_url: str = ""
    birth_date: Optional[str] = None

class ActorUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    birth_date: Optional[str] = None

class ReviewCreate(BaseModel):
    rating: float = Field(ge=0.5, le=10.0)
    text: str = ""

# ----------- Series Models -----------
class GuestStar(BaseModel):
    actor_id: str
    character_name: str

class EpisodeItem(BaseModel):
    episode_number: int
    name: str = ""
    air_date: Optional[str] = None
    overview: str = ""
    guest_stars: List[GuestStar] = []

class SeasonItem(BaseModel):
    season_number: int
    name: str = ""
    air_date: Optional[str] = None
    overview: str = ""
    poster_url: str = ""
    episodes: List[EpisodeItem] = []

class SeriesCreate(BaseModel):
    title: str
    first_air_date: Optional[str] = None
    last_air_date: Optional[str] = None
    genres: List[str] = []
    synopsis: str = ""
    poster_url: str = ""
    backdrop_url: str = ""
    trailer_url: str = ""
    status: str = "Ongoing"  # Ongoing / Ended / Returning
    main_cast: List[CastMember] = []
    seasons: List[SeasonItem] = []
    is_trending: bool = False

class SeriesUpdate(BaseModel):
    title: Optional[str] = None
    first_air_date: Optional[str] = None
    last_air_date: Optional[str] = None
    genres: Optional[List[str]] = None
    synopsis: Optional[str] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    trailer_url: Optional[str] = None
    status: Optional[str] = None
    main_cast: Optional[List[CastMember]] = None
    seasons: Optional[List[SeasonItem]] = None
    is_trending: Optional[bool] = None

# ----------- Utility -----------
def doc_to_dict(doc, id_key="id"):
    if not doc:
        return doc
    doc[id_key] = str(doc.pop("_id"))
    return doc

async def enrich_movie(doc):
    doc_to_dict(doc)
    # attach actors data
    cast = doc.get("cast", []) or []
    actor_ids = [c["actor_id"] for c in cast if c.get("actor_id")]
    actors_map = {}
    if actor_ids:
        object_ids = []
        for aid in actor_ids:
            try:
                object_ids.append(ObjectId(aid))
            except Exception:
                pass
        cursor = db.actors.find({"_id": {"$in": object_ids}})
        async for a in cursor:
            a_id = str(a["_id"])
            actors_map[a_id] = {"id": a_id, "name": a.get("name"), "photo_url": a.get("photo_url", "")}
    enriched_cast = []
    for c in cast:
        actor = actors_map.get(c.get("actor_id"))
        if actor:
            enriched_cast.append({**c, "actor": actor})
    doc["cast"] = enriched_cast
    # rating aggregation
    agg = await db.reviews.aggregate([
        {"$match": {"movie_id": doc["id"]}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    if agg:
        doc["avg_rating"] = round(agg[0]["avg"], 1)
        doc["rating_count"] = agg[0]["count"]
    else:
        doc["avg_rating"] = None
        doc["rating_count"] = 0
    return doc

async def enrich_series(doc, deep: bool = True):
    """Enrich a series doc with actor data on main_cast and, if deep, on episode guest_stars."""
    doc_to_dict(doc)
    # gather all actor ids used
    actor_ids = set()
    for c in doc.get("main_cast", []) or []:
        if c.get("actor_id"):
            actor_ids.add(c["actor_id"])
    if deep:
        for season in doc.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                for gs in ep.get("guest_stars", []) or []:
                    if gs.get("actor_id"):
                        actor_ids.add(gs["actor_id"])
    actors_map = {}
    if actor_ids:
        object_ids = []
        for aid in actor_ids:
            try:
                object_ids.append(ObjectId(aid))
            except Exception:
                pass
        async for a in db.actors.find({"_id": {"$in": object_ids}}):
            aid = str(a["_id"])
            actors_map[aid] = {"id": aid, "name": a.get("name"), "photo_url": a.get("photo_url", "")}
    enriched_main = []
    for c in doc.get("main_cast", []) or []:
        actor = actors_map.get(c.get("actor_id"))
        if actor:
            enriched_main.append({**c, "actor": actor})
    doc["main_cast"] = enriched_main
    if deep:
        for season in doc.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                enriched_gs = []
                for gs in ep.get("guest_stars", []) or []:
                    actor = actors_map.get(gs.get("actor_id"))
                    if actor:
                        enriched_gs.append({**gs, "actor": actor})
                ep["guest_stars"] = enriched_gs
    # episode / season counts
    seasons = doc.get("seasons", []) or []
    doc["season_count"] = len(seasons)
    doc["episode_count"] = sum(len(s.get("episodes", []) or []) for s in seasons)
    return doc

# ----------- Auth Routes -----------
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    user_id = str(result.inserted_id)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"id": user_id, "email": email, "name": payload.name, "role": "user"}

@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"id": user_id, "email": email, "name": user.get("name"), "role": user.get("role", "user")}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ----------- Movies -----------
@api_router.post("/movies")
async def create_movie(payload: MovieCreate, _admin: dict = Depends(get_current_admin)):
    doc = payload.model_dump()
    doc["cast"] = [c if isinstance(c, dict) else c.model_dump() for c in doc.get("cast", [])]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.movies.insert_one(doc)
    fetched = await db.movies.find_one({"_id": result.inserted_id})
    return await enrich_movie(fetched)

@api_router.get("/movies")
async def list_movies(
    q: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: int = 60,
):
    filter_query: dict = {}
    if q:
        # search title/genre/actor names
        actor_ids = []
        actor_cursor = db.actors.find({"name": {"$regex": q, "$options": "i"}}, {"_id": 1})
        async for a in actor_cursor:
            actor_ids.append(str(a["_id"]))
        or_filters = [
            {"title": {"$regex": q, "$options": "i"}},
            {"genres": {"$regex": q, "$options": "i"}},
        ]
        if actor_ids:
            or_filters.append({"cast.actor_id": {"$in": actor_ids}})
        filter_query["$or"] = or_filters
    if genre:
        filter_query["genres"] = {"$regex": f"^{genre}$", "$options": "i"}
    if year:
        filter_query["release_date"] = {"$regex": f"^{year}"}
    cursor = db.movies.find(filter_query).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    if sort == "rating":
        docs.sort(key=lambda x: (x.get("avg_rating") or 0), reverse=True)
    elif sort == "year":
        docs.sort(key=lambda x: x.get("release_date", ""), reverse=True)
    else:
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return docs

@api_router.get("/movies/trending")
async def trending_movies(limit: int = 12):
    cursor = db.movies.find({"is_trending": True}).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    if not docs:
        # fallback: top rated
        all_cursor = db.movies.find({}).limit(30)
        async for d in all_cursor:
            docs.append(await enrich_movie(d))
        docs.sort(key=lambda x: (x.get("avg_rating") or 0), reverse=True)
        docs = docs[:limit]
    return docs

@api_router.get("/movies/recent")
async def recent_movies(limit: int = 12):
    cursor = db.movies.find({}).sort("created_at", -1).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_movie(d))
    return docs

@api_router.get("/movies/{movie_id}")
async def get_movie(movie_id: str):
    try:
        doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Movie not found")
    return await enrich_movie(doc)

@api_router.patch("/movies/{movie_id}")
async def update_movie(movie_id: str, payload: MovieUpdate, _admin: dict = Depends(get_current_admin)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "cast" in update_data:
        update_data["cast"] = [c if isinstance(c, dict) else c.model_dump() for c in update_data["cast"]]
    await db.movies.update_one({"_id": ObjectId(movie_id)}, {"$set": update_data})
    doc = await db.movies.find_one({"_id": ObjectId(movie_id)})
    return await enrich_movie(doc)

@api_router.delete("/movies/{movie_id}")
async def delete_movie(movie_id: str, _admin: dict = Depends(get_current_admin)):
    await db.movies.delete_one({"_id": ObjectId(movie_id)})
    await db.reviews.delete_many({"movie_id": movie_id})
    return {"ok": True}

# ----------- Series -----------
def _serialize_series_payload(data: dict) -> dict:
    if "main_cast" in data and data["main_cast"] is not None:
        data["main_cast"] = [c if isinstance(c, dict) else c.model_dump() for c in data["main_cast"]]
    if "seasons" in data and data["seasons"] is not None:
        out_seasons = []
        for s in data["seasons"]:
            s = s if isinstance(s, dict) else s.model_dump()
            eps = []
            for ep in s.get("episodes", []) or []:
                ep = ep if isinstance(ep, dict) else ep.model_dump()
                gs = [(g if isinstance(g, dict) else g.model_dump()) for g in ep.get("guest_stars", []) or []]
                ep["guest_stars"] = gs
                eps.append(ep)
            s["episodes"] = eps
            out_seasons.append(s)
        data["seasons"] = out_seasons
    return data

@api_router.post("/series")
async def create_series(payload: SeriesCreate, _admin: dict = Depends(get_current_admin)):
    doc = _serialize_series_payload(payload.model_dump())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.series.insert_one(doc)
    fetched = await db.series.find_one({"_id": result.inserted_id})
    return await enrich_series(fetched)

@api_router.get("/series")
async def list_series(
    q: Optional[str] = None,
    genre: Optional[str] = None,
    year: Optional[int] = None,
    sort: Optional[str] = "recent",
    limit: int = 60,
):
    filter_query: dict = {}
    if q:
        actor_ids = []
        async for a in db.actors.find({"name": {"$regex": q, "$options": "i"}}, {"_id": 1}):
            actor_ids.append(str(a["_id"]))
        or_filters = [
            {"title": {"$regex": q, "$options": "i"}},
            {"genres": {"$regex": q, "$options": "i"}},
        ]
        if actor_ids:
            or_filters.append({"main_cast.actor_id": {"$in": actor_ids}})
            or_filters.append({"seasons.episodes.guest_stars.actor_id": {"$in": actor_ids}})
        filter_query["$or"] = or_filters
    if genre:
        filter_query["genres"] = {"$regex": f"^{genre}$", "$options": "i"}
    if year:
        filter_query["first_air_date"] = {"$regex": f"^{year}"}
    cursor = db.series.find(filter_query).limit(limit)
    docs = []
    async for d in cursor:
        docs.append(await enrich_series(d, deep=False))
    if sort == "year":
        docs.sort(key=lambda x: x.get("first_air_date", ""), reverse=True)
    else:
        docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return docs

@api_router.get("/series/trending")
async def trending_series(limit: int = 12):
    docs = []
    async for d in db.series.find({"is_trending": True}).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    if not docs:
        async for d in db.series.find({}).sort("created_at", -1).limit(limit):
            docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/recent")
async def recent_series(limit: int = 12):
    docs = []
    async for d in db.series.find({}).sort("created_at", -1).limit(limit):
        docs.append(await enrich_series(d, deep=False))
    return docs

@api_router.get("/series/{series_id}")
async def get_series(series_id: str):
    try:
        doc = await db.series.find_one({"_id": ObjectId(series_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Series not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Series not found")
    return await enrich_series(doc)

@api_router.patch("/series/{series_id}")
async def update_series(series_id: str, payload: SeriesUpdate, _admin: dict = Depends(get_current_admin)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    update_data = _serialize_series_payload(update_data)
    await db.series.update_one({"_id": ObjectId(series_id)}, {"$set": update_data})
    doc = await db.series.find_one({"_id": ObjectId(series_id)})
    return await enrich_series(doc)

@api_router.delete("/series/{series_id}")
async def delete_series(series_id: str, _admin: dict = Depends(get_current_admin)):
    await db.series.delete_one({"_id": ObjectId(series_id)})
    return {"ok": True}

# ----------- Global Search -----------
@api_router.get("/search")
async def global_search(q: str, limit: int = 20):
    q = q.strip()
    if not q:
        return {"movies": [], "series": [], "actors": []}
    # actors
    actor_docs = []
    actor_ids_str = []
    async for a in db.actors.find({"name": {"$regex": q, "$options": "i"}}).limit(limit):
        actor_ids_str.append(str(a["_id"]))
        actor_docs.append(doc_to_dict(a))
    # movies: title, genre, or cast actor
    m_or = [
        {"title": {"$regex": q, "$options": "i"}},
        {"genres": {"$regex": q, "$options": "i"}},
    ]
    if actor_ids_str:
        m_or.append({"cast.actor_id": {"$in": actor_ids_str}})
    movies = []
    async for d in db.movies.find({"$or": m_or}).limit(limit):
        movies.append(await enrich_movie(d))
    # series
    s_or = [
        {"title": {"$regex": q, "$options": "i"}},
        {"genres": {"$regex": q, "$options": "i"}},
    ]
    if actor_ids_str:
        s_or.append({"main_cast.actor_id": {"$in": actor_ids_str}})
        s_or.append({"seasons.episodes.guest_stars.actor_id": {"$in": actor_ids_str}})
    series_docs = []
    async for d in db.series.find({"$or": s_or}).limit(limit):
        series_docs.append(await enrich_series(d, deep=False))
    return {"movies": movies, "series": series_docs, "actors": actor_docs}


# ----------- Actors -----------
@api_router.post("/actors")
async def create_actor(payload: ActorCreate, _admin: dict = Depends(get_current_admin)):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.actors.insert_one(doc)
    fetched = await db.actors.find_one({"_id": result.inserted_id})
    return doc_to_dict(fetched)

@api_router.get("/actors")
async def list_actors(q: Optional[str] = None, limit: int = 100):
    filter_query = {}
    if q:
        filter_query["name"] = {"$regex": q, "$options": "i"}
    cursor = db.actors.find(filter_query).limit(limit)
    return [doc_to_dict(d) async for d in cursor]

@api_router.get("/actors/{actor_id}")
async def get_actor(actor_id: str):
    try:
        doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Actor not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Actor not found")
    actor = doc_to_dict(doc)
    # find movies with this actor in cast
    movies_cursor = db.movies.find({"cast.actor_id": actor_id})
    movies = []
    async for m in movies_cursor:
        m_dict = await enrich_movie(m)
        for c in m_dict.get("cast", []):
            if c.get("actor_id") == actor_id:
                m_dict["character_name"] = c.get("character_name")
                break
        movies.append(m_dict)
    actor["movies"] = movies

    # find series where actor is in main_cast
    series_main = []
    async for s in db.series.find({"main_cast.actor_id": actor_id}):
        s_dict = await enrich_series(s, deep=False)
        for c in s_dict.get("main_cast", []):
            if c.get("actor_id") == actor_id:
                s_dict["character_name"] = c.get("character_name")
                break
        series_main.append(s_dict)
    actor["series"] = series_main

    # find guest star episodes
    guest_episodes = []
    async for s in db.series.find({"seasons.episodes.guest_stars.actor_id": actor_id}):
        sid = str(s["_id"])
        for season in s.get("seasons", []) or []:
            for ep in season.get("episodes", []) or []:
                for gs in ep.get("guest_stars", []) or []:
                    if gs.get("actor_id") == actor_id:
                        guest_episodes.append({
                            "series_id": sid,
                            "series_title": s.get("title"),
                            "series_poster_url": s.get("poster_url", ""),
                            "season_number": season.get("season_number"),
                            "episode_number": ep.get("episode_number"),
                            "episode_name": ep.get("name"),
                            "air_date": ep.get("air_date"),
                            "character_name": gs.get("character_name"),
                        })
    # sort by season/episode
    guest_episodes.sort(key=lambda x: (x.get("season_number") or 0, x.get("episode_number") or 0))
    actor["guest_episodes"] = guest_episodes
    return actor

@api_router.patch("/actors/{actor_id}")
async def update_actor(actor_id: str, payload: ActorUpdate, _admin: dict = Depends(get_current_admin)):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.actors.update_one({"_id": ObjectId(actor_id)}, {"$set": update_data})
    doc = await db.actors.find_one({"_id": ObjectId(actor_id)})
    return doc_to_dict(doc)

@api_router.delete("/actors/{actor_id}")
async def delete_actor(actor_id: str, _admin: dict = Depends(get_current_admin)):
    await db.actors.delete_one({"_id": ObjectId(actor_id)})
    return {"ok": True}

# ----------- Reviews -----------
@api_router.post("/movies/{movie_id}/reviews")
async def create_review(movie_id: str, payload: ReviewCreate, user: dict = Depends(get_current_user)):
    doc = {
        "movie_id": movie_id,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "rating": payload.rating,
        "text": payload.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # upsert per user per movie
    await db.reviews.update_one(
        {"movie_id": movie_id, "user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/movies/{movie_id}/reviews")
async def list_reviews(movie_id: str):
    cursor = db.reviews.find({"movie_id": movie_id}).sort("created_at", -1)
    return [doc_to_dict(d) async for d in cursor]

# ----------- Watchlist -----------
@api_router.post("/watchlist/{movie_id}")
async def add_watchlist(movie_id: str, user: dict = Depends(get_current_user)):
    await db.watchlist.update_one(
        {"user_id": user["id"], "movie_id": movie_id},
        {"$set": {"user_id": user["id"], "movie_id": movie_id, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}

@api_router.delete("/watchlist/{movie_id}")
async def remove_watchlist(movie_id: str, user: dict = Depends(get_current_user)):
    await db.watchlist.delete_one({"user_id": user["id"], "movie_id": movie_id})
    return {"ok": True}

@api_router.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    cursor = db.watchlist.find({"user_id": user["id"]}).sort("created_at", -1)
    movie_ids = []
    async for w in cursor:
        movie_ids.append(w["movie_id"])
    if not movie_ids:
        return []
    object_ids = []
    for mid in movie_ids:
        try:
            object_ids.append(ObjectId(mid))
        except Exception:
            pass
    movies = []
    cur = db.movies.find({"_id": {"$in": object_ids}})
    async for m in cur:
        movies.append(await enrich_movie(m))
    return movies

# ----------- Genres -----------
@api_router.get("/genres")
async def genres():
    result = await db.movies.distinct("genres")
    return sorted([g for g in result if g])

# ----------- Uploads -----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), _admin: dict = Depends(get_current_admin)):
    ext = (file.filename.rsplit(".", 1)[-1] or "bin").lower()
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/admin/{file_id}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    backend_url = os.environ.get("FRONTEND_URL", "").replace("http://localhost:3000", "")
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api_router.get("/files/{path:path}")
async def download_file(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return FastAPIResponse(content=data, media_type=content_type)

# ----------- Startup -----------
@app.on_event("startup")
async def startup():
    # ensure indexes
    await db.users.create_index("email", unique=True)
    await db.movies.create_index("title")
    await db.actors.create_index("name")
    await db.series.create_index("title")
    await db.watchlist.create_index([("user_id", 1), ("movie_id", 1)], unique=True)
    await db.reviews.create_index([("movie_id", 1), ("user_id", 1)], unique=True)

    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@cineverse.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}})
        logger.info(f"Updated admin password: {admin_email}")

    # init storage
    init_storage()

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
