 import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, fileUrl, recoverTmdbImage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Star, Bookmark, BookmarkCheck, PlayCircle, Calendar, Clock, Edit, Trash2,
  Flag, Lock, Award, Heart, Share2, TrendingUp, ChevronRight, Film, MessageSquare, History as HistoryIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import EntityEditDialog from "@/components/EntityEditDialog";
import EditHistoryPanel from "@/components/EditHistoryPanel";
import SimilarSection from "@/components/SimilarSection";
import EntityForumThreads from "@/components/EntityForumThreads";
import ReportDialog from "@/components/ReportDialog";
import LockFieldsDialog from "@/components/LockFieldsDialog";
import VideosSection from "@/components/VideosSection";
import InlineMediaEditor from "@/components/InlineMediaEditor";
import TrailerPlayer from "@/components/TrailerPlayer";
import CollectionCard from "@/components/CollectionCard";
import ImageWithFallback from "@/components/ImageWithFallback";
import WatchProgressControl from "@/components/WatchProgressControl";
import PageMetadata from "@/components/PageMetadata";
import WatchAvailability from "@/components/WatchAvailability";

// ---------- helpers ----------
const fmtMoney = (n) => {
  if (n == null || n === "" || Number(n) === 0) return "—";
  const v = Number(n);
  return "$" + v.toLocaleString();
};
const fmtDate = (s) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return s; }
};
const year = (s) => (s || "").slice(0, 4);

// Circular user-score badge — score is 0-100
function ScoreCircle({ score, size = 68 }) {
  const s = Math.max(0, Math.min(100, Math.round(score || 0)));
  const stroke = s >= 70 ? "#22c55e" : s >= 40 ? "#eab308" : "#ef4444";
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const dash = (s / 100) * c;
  return (
    <div className="relative flex items-center justify-center rounded-full bg-[#0d0f12]" style={{ width: size, height: size }} data-testid="user-score-circle">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="#1f2937" strokeWidth="4" fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={stroke} strokeWidth="4" fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute font-bold text-white text-lg">{s}<span className="text-[9px] align-top">%</span></div>
    </div>
  );
}

// Sparkline SVG for popularity trend (array of numbers)
function Sparkline({ points = [], width = 220, height = 56 }) {
  if (!points.length) return <div className="h-14 text-xs text-slate-500 flex items-center">No trend yet</div>;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - (p / max) * (height - 4) - 2}`).join(" ");
  const areaPath = `${path} L ${(points.length - 1) * step} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" data-testid="popularity-sparkline">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-grad)" />
      <path d={path} stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ trend: [], contributors: [], content_score: 0, total_views: 0 });
  const [rating, setRating] = useState(8);
  const [reviewText, setReviewText] = useState("");
  const [reviewContainsSpoilers, setReviewContainsSpoilers] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const load = async () => {
    try {
      const [m, r, s] = await Promise.all([
        api.get(`/movies/${id}`),
        api.get(`/movies/${id}/reviews`),
        api.get(`/movies/${id}/stats`).catch(() => ({ data: { trend: [], contributors: [], content_score: 0, total_views: 0 } })),
      ]);
      setMovie(m.data); setReviews(r.data); setStats(s.data);
      if (user) {
        try {
          const wl = await api.get("/watchlist");
          setInWatchlist(wl.data.some((item) => item.id === id && (!item.type || item.type === "movie")));
        } catch {}
      }
    } catch {
      toast.error("Failed to load movie");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, user]);

  const canModerate = user && ["moderator", "admin"].includes(user.effective_role || user.role);
  const canDeletePage = user && (user.role === "admin" || user.effective_role === "admin" || (user.permissions || []).some((permission) => ["content.delete", "content.movie.delete"].includes(permission)));

  const toggleWatchlist = async () => {
    if (!user) { toast.error("Sign in to save movies"); return; }
    try {
      if (inWatchlist) { await api.delete(`/watchlist/${id}`); setInWatchlist(false); toast.success("Removed from watchlist"); }
      else { await api.post(`/watchlist/${id}`); setInWatchlist(true); toast.success("Added to watchlist"); }
    } catch { toast.error("Something went wrong"); }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to rate"); return; }
    try { await api.post(`/movies/${id}/reviews`, { rating: Number(rating), text: reviewText, contains_spoilers: reviewContainsSpoilers }); toast.success("Review submitted"); setReviewText(""); setReviewContainsSpoilers(false); load(); }
    catch { toast.error("Failed to submit review"); }
  };

  const deleteReview = async (review) => {
    if (!window.confirm("Delete this review?")) return;
    try {
      await api.delete(`/reviews/${review.id}`);
      setReviews((current) => current.filter((item) => item.id !== review.id));
      toast.success("Review deleted");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to delete review"); }
  };

  const del = async () => {
    if (!window.confirm(`Delete "${movie.title}"?`)) return;
    try { await api.delete(`/movies/${id}`); toast.success("Deleted"); navigate("/"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: movie?.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch {}
  };

  if (!movie) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const backdrop = movie.backdrop_url ? fileUrl(movie.backdrop_url) : (movie.poster_url ? fileUrl(movie.poster_url) : null);
  const backdropField = movie.backdrop_url ? "backdrop_url" : "poster_url";
  const poster = movie.poster_url ? fileUrl(movie.poster_url) : null;
  const score100 = movie.avg_rating != null ? movie.avg_rating * 10 : 0;
  const directors = (movie.crew || []).filter((c) => c.role === "Director");
  const writers = (movie.crew || []).filter((c) => c.role === "Writer");
  const hasAwards = (movie.awards_wins || 0) > 0 || (movie.awards_nominations || 0) > 0;
  const trendPoints = (stats.trend || []).map((t) => t.count);
  const posters = Array.from(new Set([
    ...(movie.poster_urls || []),
    ...(movie.poster_url ? [movie.poster_url] : []),
  ])).filter(Boolean);
  const backdrops = Array.from(new Set([
    ...(movie.backdrop_urls || []),
    ...(movie.backdrop_url ? [movie.backdrop_url] : []),
  ])).filter(Boolean);
  const gallery = (movie.gallery || []).filter(Boolean);

  return (
    <div className="text-white bg-[#0d0f12]">
      <PageMetadata
        title={`${movie.title}${year(movie.release_date) ? ` (${year(movie.release_date)})` : ""}`}
        description={movie.synopsis || `Explore the cast, crew, reviews, and details for ${movie.title} on Filmhub.`}
        image={backdrop || poster}
        schemaType="Movie"
        datePublished={movie.release_date || undefined}
        genres={movie.genres || []}
      />
      <section className="relative overflow-hidden border-b border-white/10 bg-[#0d0f12]" data-testid="movie-hero">
        <div className="absolute inset-0">
          {backdrop && <ImageWithFallback src={backdrop} resolveFallback={() => recoverTmdbImage("movie", movie.id, backdropField)} alt="" className="w-full h-full object-cover opacity-80" loading="eager" decoding="async" fetchPriority="high" />}
          <div className="absolute inset-0 bg-[#0d0f12]/75" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.12),transparent_20%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0f12] via-[#0d0f12]/90 to-[#0d0f12]/65" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr] gap-8 items-start">
            <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-[#14181f]/80 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm ring-1 ring-white/5">
              <div className="aspect-[2/3]">
                {poster ? (
                  <ImageWithFallback
                    src={poster}
                    alt={movie.title}
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    fallback={<div className="flex h-full items-center justify-center text-2xl font-display text-slate-600">NO POSTER</div>}
                  />
                ) : <div className="flex h-full items-center justify-center text-2xl font-display text-slate-600">NO POSTER</div>}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-amber-300/90">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">Now showing</span>
                {movie.status && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200">{movie.status}</span>}
              </div>

              <div>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-none tracking-tight text-white" data-testid="movie-title">
                  {movie.title}
                  <span className="ml-3 text-slate-400 font-normal">({year(movie.release_date)})</span>
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-200">
                  {movie.release_date && <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-400" /> {fmtDate(movie.release_date)}</span>}
                  {(movie.genres || []).length > 0 && <span className="inline-flex items-center gap-2"><Film className="h-4 w-4 text-amber-400" /> {(movie.genres || []).join(" · ")}</span>}
                  {movie.runtime ? <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" /> {Math.floor(movie.runtime/60)}h {movie.runtime % 60}m</span> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-[#0f1318]/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.24)]">
                <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-amber-400">CineVerse dossier</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Release</div>
                    <div className="mt-2 text-sm font-semibold text-white">{movie.release_date ? fmtDate(movie.release_date) : "TBA"}</div>
                  </div>
                  <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-transparent p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Runtime</div>
                    <div className="mt-2 text-sm font-semibold text-white">{movie.runtime ? `${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m` : "—"}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Director</div>
                    <div className="mt-2 text-sm font-semibold text-white">{directors[0]?.name || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#14181f]/80 px-3 py-2 backdrop-blur-sm">
                  <ScoreCircle score={score100} />
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">CineVerse</div>
                    <div className="font-semibold text-white">Score</div>
                  </div>
                </div>

                <div className="hidden sm:block h-12 w-px bg-white/10" />

                <button onClick={toggleWatchlist} className={`inline-flex h-12 w-12 items-center justify-center rounded-full border transition-all ${inWatchlist ? "border-amber-500 bg-amber-500 text-black" : "border-white/15 bg-[#14181f]/80 text-white hover:border-amber-500/40 hover:bg-white/10"}`} title="Watchlist" data-testid="watchlist-toggle-btn">
                  {inWatchlist ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                </button>
                <button onClick={toggleWatchlist} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-[#14181f]/80 text-white transition hover:border-amber-500/40 hover:bg-white/10" title="Favorite" data-testid="favorite-btn">
                  <Heart className="h-5 w-5" />
                </button>
                <button onClick={share} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-[#14181f]/80 text-white transition hover:border-amber-500/40 hover:bg-white/10" title="Share" data-testid="share-btn">
                  <Share2 className="h-5 w-5" />
                </button>
                {movie.trailer_url && (
                  <TrailerPlayer url={movie.trailer_url} title={`${movie.title} — Trailer`} testId="play-trailer-inline">
                    <Button className="border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20">
                      <PlayCircle className="mr-2 h-4 w-4" /> Play trailer
                    </Button>
                  </TrailerPlayer>
                )}
              </div>

              {movie.tagline && (
                <p className="max-w-3xl text-lg italic text-amber-100/90" data-testid="movie-tagline">
                  “{movie.tagline}”
                </p>
              )}

              <div className="rounded-2xl border border-white/10 bg-[#14181f]/75 p-5 backdrop-blur-sm">
                <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Story</div>
                <p className="text-base leading-relaxed text-slate-200" data-testid="movie-synopsis">{movie.synopsis || "No synopsis available."}</p>
              </div>

              {(directors.length > 0 || writers.length > 0) && (
                <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
                  {directors.map((d, i) => (
                    <div key={`d-${i}`} className="rounded-xl border border-white/10 bg-[#14181f]/70 p-3" data-testid={`director-${i}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Director</div>
                      <div className="mt-2 font-semibold text-white">{d.name}</div>
                    </div>
                  ))}
                  {writers.filter((w) => !directors.some((d) => d.name === w.name)).map((w, i) => (
                    <div key={`w-${i}`} className="rounded-xl border border-white/10 bg-[#14181f]/70 p-3" data-testid={`writer-${i}`}>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Writer</div>
                      <div className="mt-2 font-semibold text-white">{w.name}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {user && (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/movie/${id}/edit`)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-movie-btn">
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                )}
                {user && (
                  <InlineMediaEditor
                    kind="movie"
                    entity={movie}
                    onUpdated={(patch) => setMovie((m) => ({ ...m, ...patch }))}
                  />
                )}
                {user && (
                  <Button size="sm" variant="outline" onClick={() => setReportOpen(true)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="report-movie-btn">
                    <Flag className="mr-2 h-4 w-4" /> Report a Problem
                  </Button>
                )}
                {canModerate && (
                  <Button size="sm" variant="outline" onClick={() => setLockOpen(true)} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200" data-testid="lock-movie-btn">
                    <Lock className="mr-2 h-4 w-4" /> Locks{movie.locked_fields?.length ? ` (${movie.locked_fields.length})` : ""}
                  </Button>
                )}
                {canDeletePage && (
                  <Button size="sm" variant="outline" onClick={del} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="delete-movie-btn">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <WatchProgressControl kind="movie" entityId={id} />

      {hasAwards && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" data-testid="awards-strip">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-900/35 via-emerald-800/20 to-cyan-900/25 px-6 py-4">
            <div className="inline-flex items-center gap-2 text-lg font-semibold text-emerald-300">
              <Award className="h-5 w-5" /> Awards
            </div>
            {movie.awards_wins ? (
              <div className="text-slate-200"><span className="font-bold text-white">{movie.awards_wins}</span> Win{movie.awards_wins !== 1 && "s"}</div>
            ) : null}
            {movie.awards_wins && movie.awards_nominations ? <div className="h-6 w-px bg-white/10" /> : null}
            {movie.awards_nominations ? (
              <div className="text-slate-200"><span className="font-bold text-white">{movie.awards_nominations}</span> Nomination{movie.awards_nominations !== 1 && "s"}</div>
            ) : null}
          </div>
        </section>
      )}

      {/* ================= TWO-COLUMN CONTENT ================= */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        {/* MAIN COLUMN */}
        <div className="min-w-0">
          {/* Top Billed Cast */}
          <section data-testid="cast-section">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-heading text-2xl font-bold">Top Billed Cast</h2>
              <Link to={`/movie/${id}/credits`} className="text-sm text-amber-400 hover:text-amber-300 inline-flex items-center" data-testid="movie-full-credits-link">Full Cast &amp; Crew <ChevronRight className="w-4 h-4" /></Link>
            </div>
            {(!movie.cast || movie.cast.length === 0) ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">No cast added yet.</div>
            ) : (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
                {movie.cast.filter((c) => c && c.actor && c.actor.id).map((c, idx) => (
                  <Link to={`/actor/${c.actor.id}`} key={idx} className="group block flex-shrink-0 w-[140px] rounded-xl overflow-hidden bg-[#14181f] border border-white/5 snap-start hover:border-amber-500/30 transition">
                    <div className="aspect-[3/4] bg-[#1e2430] overflow-hidden">
                      <ImageWithFallback
                        src={fileUrl(c.actor.photo_url)}
                        fallbackSrc={fileUrl(c.actor.photo_url, "jpeg")}
                        alt={c.actor.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        fallback={<div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-xl">{c.actor.name?.[0] || "?"}</div>}
                      />
                    </div>
                    <div className="p-2.5">
                      <div className="font-semibold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{c.actor.name}</div>
                      <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{c.character_name}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Videos */}
          <VideosSection trailerUrl={movie.trailer_url} videoUrls={movie.video_urls} testIdPrefix="movie-video" />

          {/* Collections */}
          {(movie.collections || []).length > 0 && (
            <section className="mt-12 space-y-4" data-testid="movie-collections-section">
              {movie.collections.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </section>
          )}

          {/* Social: Reviews / Discussions tabs */}
          <section className="mt-12" data-testid="social-section">
            <h2 className="font-heading text-2xl font-bold">Social</h2>
            <Tabs defaultValue="reviews" className="mt-4">
              <TabsList className="bg-transparent border-b border-white/10 rounded-none p-0 h-auto w-full justify-start gap-6">
                <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0" data-testid="tab-reviews">
                  <Star className="w-4 h-4 mr-2" /> Reviews <span className="ml-1 text-xs text-slate-500">{reviews.length}</span>
                </TabsTrigger>
                <TabsTrigger value="discussions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0" data-testid="tab-discussions">
                  <MessageSquare className="w-4 h-4 mr-2" /> Discussions
                </TabsTrigger>
              </TabsList>
              <TabsContent value="reviews" className="mt-6">
                {user ? (
                  <form onSubmit={submitReview} className="rounded-xl bg-[#14181f] border border-white/10 p-5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Your rating: <span className="text-amber-400 text-lg">{rating}/10</span></label>
                    <input type="range" min="1" max="10" step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} className="w-full mt-3 accent-amber-500" data-testid="rating-slider" />
                    <Textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share your thoughts..." className="mt-4 bg-[#0d0f12] border-white/10 text-white" rows={3} data-testid="review-text-input" />
                    <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={reviewContainsSpoilers} onChange={(e) => setReviewContainsSpoilers(e.target.checked)} className="accent-amber-500" data-testid="review-spoiler-checkbox" /> Contains spoilers</label>
                    <Button type="submit" className="mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="submit-review-btn">Submit Review</Button>
                  </form>
                ) : (
                  <div className="rounded-xl bg-[#14181f] border border-white/10 p-5 text-slate-400 text-sm">
                    <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to write a review.
                  </div>
                )}
                <div className="mt-6 space-y-3">
                  {reviews.length === 0 ? (
                    <div className="text-slate-500 text-sm">No reviews yet. Be the first!</div>
                  ) : reviews.map((r) => (
                    <div key={r.id} className="rounded-xl bg-[#14181f] border border-white/10 p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">{r.user_name?.[0] || "?"}</div>
                          <Link to={`/user/${r.user_id}`} className="font-semibold text-white hover:text-amber-400">{r.user_name || "Anonymous"}</Link>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-amber-400 font-bold"><Star className="w-4 h-4 fill-amber-400" /> {r.rating}</div>
                          {user && (canModerate || user.id === r.user_id) && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => deleteReview(r)} aria-label="Delete review" title="Delete review" data-testid={`delete-review-${r.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {r.text && (r.contains_spoilers ? <details className="mt-2"><summary className="cursor-pointer text-sm text-amber-300">Spoiler review · reveal</summary><p className="mt-2 text-slate-300 text-sm leading-relaxed">{r.text}</p></details> : <p className="mt-2 text-slate-300 text-sm leading-relaxed">{r.text}</p>)}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="discussions" className="mt-6">
                <EntityForumThreads entityType="movie" entityId={id} entityTitle={movie.title} />
              </TabsContent>
            </Tabs>
          </section>

          {/* Media tabs */}
          <section className="mt-12" data-testid="media-section">
            <h2 className="font-heading text-2xl font-bold">Media</h2>
            <Tabs defaultValue="backdrops" className="mt-4">
              <TabsList className="bg-transparent border-b border-white/10 rounded-none p-0 h-auto w-full justify-start gap-6">
                <TabsTrigger value="backdrops" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0">
                  Backdrops <span className="ml-1 text-xs text-slate-500">{backdrops.length}</span>
                </TabsTrigger>
                <TabsTrigger value="posters" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0">
                  Posters <span className="ml-1 text-xs text-slate-500">{posters.length}</span>
                </TabsTrigger>
                <TabsTrigger value="gallery" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0">
                  Gallery <span className="ml-1 text-xs text-slate-500">{gallery.length}</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="backdrops" className="mt-4">
                {backdrops.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500 text-sm">No backdrops yet.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {backdrops.map((img, i) => (
                      <div key={i} className="rounded-lg overflow-hidden aspect-video bg-[#1e2430] border border-white/5">
                        <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="posters" className="mt-4">
                {posters.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500 text-sm">No poster images yet.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {posters.map((img, i) => (
                      <div key={i} className="rounded-lg overflow-hidden aspect-[2/3] bg-[#1e2430] border border-white/5">
                        <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="gallery" className="mt-4">
                {gallery.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500 text-sm">No gallery images yet.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="gallery-grid">
                    {gallery.map((img, i) => (
                      <div key={i} className="rounded-lg overflow-hidden aspect-video bg-[#1e2430] border border-white/5">
                        <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>

          {/* Similar */}
          <SimilarSection kind="movie" entityId={id} />

          {/* Edit History */}
          <section className="mt-12">
            <EditHistoryPanel key={historyKey} entityType="movie" entityId={id} onReverted={load} />
          </section>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-6" data-testid="movie-sidebar">
          {movie.trailer_url && (
            <TrailerPlayer url={movie.trailer_url} title={`${movie.title} — Trailer`} testId="play-trailer-sidebar">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11"><PlayCircle className="w-5 h-5 mr-2" /> Watch Trailer</Button>
            </TrailerPlayer>
          )}

          <section className="rounded-2xl border border-amber-500/20 bg-[#14181f]/80 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
            <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-amber-400">Collector notes</div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="text-slate-400">Status</span>
                <span className="font-semibold text-white" data-testid="sidebar-status">{movie.status || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="text-slate-400">Original language</span>
                <span className="font-semibold text-white" data-testid="sidebar-language">{movie.original_language || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="text-slate-400">Budget</span>
                <span className="font-semibold text-white" data-testid="sidebar-budget">{fmtMoney(movie.budget)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="text-slate-400">Revenue</span>
                <span className="font-semibold text-white" data-testid="sidebar-revenue">{fmtMoney(movie.revenue)}</span>
              </div>
            </div>
          </section>

          <WatchAvailability kind="movie" id={id} manualOptions={movie.purchase_options || []} />

          <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">Keywords</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(movie.keywords || []).length === 0 ? (
                <span className="text-slate-500 text-xs">No keywords yet</span>
              ) : (movie.keywords || []).map((k) => (
                <Link key={k} to={`/keyword/${encodeURIComponent(k)}`} data-testid={`keyword-link-${k}`}>
                  <Badge className="cursor-pointer bg-white/5 text-slate-200 border border-white/10 rounded-md text-xs hover:bg-amber-500/15 hover:text-amber-200">{k}</Badge>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-xs uppercase tracking-widest text-slate-500">Content Score</div>
              <div className="font-bold text-amber-400" data-testid="content-score-value">{stats.content_score}</div>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#0d0f12] overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400" style={{ width: `${stats.content_score}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">{stats.content_score >= 80 ? "Yes! Looking good!" : stats.content_score >= 50 ? "Almost there — a few fields missing." : "Needs more info to be complete."}</div>
          </div>

          <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">Top Contributors</div>
            {stats.contributors.length === 0 ? (
              <div className="mt-3 text-xs text-slate-500">No contributors yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {stats.contributors.map((c) => (
                  <Link to={`/user/${c.user_id}`} key={c.user_id} className="flex items-center gap-3 hover:bg-white/5 rounded-lg p-1.5 -m-1.5 transition" data-testid={`contributor-${c.user_id}`}>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                      {c.avatar_url ? <img src={fileUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" /> : (c.name?.[0] || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{c.name}</div>
                    </div>
                    <div className="text-sm font-bold text-amber-400">{c.count}</div>
                  </Link>
                ))}
              </div>
            )}
            <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('[data-testid="edit-history-panel"]')?.scrollIntoView({ behavior: "smooth" }); }} className="mt-3 inline-flex items-center text-sm text-amber-400 hover:text-amber-300">
              <HistoryIcon className="w-4 h-4 mr-1" /> View Edit History
            </a>
          </div>

          <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Popularity Trend</div>
              <div className="text-xs text-slate-500">7d · {stats.total_views} views</div>
            </div>
            <div className="mt-2"><Sparkline points={trendPoints} /></div>
          </div>

          {user && (
            <Button onClick={() => canModerate ? navigate(`/movie/${id}/edit`) : setEditOpen(true)} variant="outline" className="w-full border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="sidebar-edit-btn">
              <Edit className="w-4 h-4 mr-2" /> Edit Page
            </Button>
          )}
          {user && (
            <button onClick={() => setReportOpen(true)} className="w-full text-left text-sm text-slate-400 hover:text-rose-300 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5" /> Report an Issue
            </button>
          )}
        </aside>
      </div>

      <EntityEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entityType="movie"
        entity={movie}
        onSaved={() => { load(); setHistoryKey((k) => k + 1); }}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="movie" entityId={id} entityTitle={movie.title} />
      <LockFieldsDialog open={lockOpen} onOpenChange={setLockOpen} entityType="movie" entity={movie} onSaved={(d) => { setMovie(d); setHistoryKey((k) => k + 1); }} />
    </div>
  );
}
