import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar, Tv, Bookmark, BookmarkCheck, PlayCircle, Heart, Share2, Edit, Trash2, Flag, Lock,
  Award, ChevronRight, ChevronDown, TrendingUp, Star, MessageSquare, History as HistoryIcon,
} from "lucide-react";
import { toast } from "sonner";
import EntityEditDialog from "@/components/EntityEditDialog";
import EditHistoryPanel from "@/components/EditHistoryPanel";
import SimilarSection from "@/components/SimilarSection";
import DiscussionSection from "@/components/DiscussionSection";
import ReportDialog from "@/components/ReportDialog";
import LockFieldsDialog from "@/components/LockFieldsDialog";
import VideosSection from "@/components/VideosSection";
import InlineMediaEditor from "@/components/InlineMediaEditor";
import TrailerPlayer from "@/components/TrailerPlayer";
import CollectionCard from "@/components/CollectionCard";

const fmtDate = (s) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return s; }
};
const year = (s) => (s || "").slice(0, 4);

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

function SeasonBlock({ season, fallbackPoster, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const episodes = season.episodes || [];
  return (
    <div className="rounded-xl bg-[#14181f] border border-white/10 overflow-hidden" data-testid={`season-block-${season.season_number}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/5 transition">
        <div className="w-16 flex-shrink-0 aspect-[2/3] rounded-md overflow-hidden bg-[#1e2430]">
          {season.poster_url ? <img src={fileUrl(season.poster_url)} alt="" className="w-full h-full object-cover" /> : (fallbackPoster ? <img src={fallbackPoster} alt="" className="w-full h-full object-cover opacity-60" /> : null)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading text-lg font-bold">{season.name || `Season ${season.season_number}`}</div>
          <div className="text-xs text-slate-400">{(season.air_date || "").slice(0, 4) || "No air date"} · {episodes.length} episode{episodes.length !== 1 && "s"}</div>
          {season.overview && <p className="text-sm text-slate-300 line-clamp-2 mt-1">{season.overview}</p>}
        </div>
        {open ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-white/10 divide-y divide-white/5">
          {episodes.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center italic">No episodes yet.</div>
          ) : episodes.map((ep, i) => (
            <div key={i} className="flex gap-4 p-4" data-testid={`episode-${season.season_number}-${ep.episode_number}`}>
              <div className="w-32 flex-shrink-0 aspect-video rounded-md overflow-hidden bg-[#1e2430]">
                {ep.still_url ? <img src={fileUrl(ep.still_url)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">No image</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-slate-500 text-sm font-mono">S{season.season_number}·E{ep.episode_number}</span>
                  <span className="font-semibold text-white">{ep.title || ep.name || "(untitled)"}</span>
                  {ep.air_date && <span className="text-xs text-slate-500">· {ep.air_date}</span>}
                </div>
                {ep.overview && <p className="mt-1 text-sm text-slate-400 line-clamp-3">{ep.overview}</p>}
                {(ep.guest_stars || []).length > 0 && (
                  <div className="mt-3" data-testid={`guest-stars-${season.season_number}-${ep.episode_number}`}>
                    <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold mb-1.5">Guest Stars</div>
                    <div className="flex flex-wrap gap-2">
                      {(ep.guest_stars || []).map((g, gi) => (
                        <Link
                          to={g.actor?.id ? `/actor/${g.actor.id}` : "#"}
                          key={gi}
                          className="flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 pl-1 pr-2.5 py-1 transition group"
                        >
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-[#1e2430] flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
                            {g.actor?.photo_url ? <img src={fileUrl(g.actor.photo_url)} alt="" className="w-full h-full object-cover" /> : (g.actor?.name?.[0] || "?")}
                          </div>
                          <span className="text-xs text-slate-200 group-hover:text-amber-400 font-medium">{g.actor?.name || "Unknown"}</span>
                          {g.character_name && <span className="text-xs text-slate-500">as {g.character_name}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function Sparkline({ points = [], width = 220, height = 56 }) {
  if (!points.length) return <div className="h-14 text-xs text-slate-500 flex items-center">No trend yet</div>;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - (p / max) * (height - 4) - 2}`).join(" ");
  const areaPath = `${path} L ${(points.length - 1) * step} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-14" data-testid="popularity-sparkline">
      <defs>
        <linearGradient id="s-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#s-spark-grad)" />
      <path d={path} stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SeriesDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState(null);
  const [stats, setStats] = useState({ trend: [], contributors: [], content_score: 0, total_views: 0 });
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(8);
  const [reviewText, setReviewText] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const load = async () => {
    try {
      const [s, st, rv] = await Promise.all([
        api.get(`/series/${id}`),
        api.get(`/series/${id}/stats`).catch(() => ({ data: { trend: [], contributors: [], content_score: 0, total_views: 0 } })),
        api.get(`/series/${id}/reviews`).catch(() => ({ data: [] })),
      ]);
      setSeries(s.data);
      setStats(st.data);
      setReviews(rv.data);
    } catch { toast.error("Failed to load series"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const canModerate = user && ["moderator", "admin"].includes(user.effective_role || user.role);

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to rate"); return; }
    try {
      await api.post(`/series/${id}/reviews`, { rating: Number(rating), text: reviewText });
      toast.success("Review submitted");
      setReviewText("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit review");
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete "${series.title}"?`)) return;
    try { await api.delete(`/series/${id}`); toast.success("Deleted"); navigate("/"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: series?.title, url }); else { await navigator.clipboard.writeText(url); toast.success("Link copied"); } } catch {}
  };

  if (!series) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const startYear = year(series.first_air_date);
  const endYear = year(series.last_air_date);
  const yearRange = startYear ? (endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear) : "";
  const backdrop = series.backdrop_url ? fileUrl(series.backdrop_url) : (series.poster_url ? fileUrl(series.poster_url) : null);
  const poster = series.poster_url ? fileUrl(series.poster_url) : null;
  const score100 = series.avg_rating != null ? series.avg_rating * 10 : 0;
  const sortedSeasons = [...(series.seasons || [])].sort((a, b) => (a.season_number || 0) - (b.season_number || 0));
  const currentSeason = sortedSeasons[sortedSeasons.length - 1];
  const creators = series.creators || [];
  const hasAwards = (series.awards_wins || 0) > 0 || (series.awards_nominations || 0) > 0;
  const trendPoints = (stats.trend || []).map((t) => t.count);
  const posters = Array.from(new Set([
    ...(series.poster_urls || []),
    ...(series.poster_url ? [series.poster_url] : []),
  ])).filter(Boolean);
  const backdrops = Array.from(new Set([
    ...(series.backdrop_urls || []),
    ...(series.backdrop_url ? [series.backdrop_url] : []),
    ...(series.gallery || []),
  ])).filter(Boolean);

  return (
    <div className="text-white">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden" data-testid="series-hero">
        <div className="absolute inset-0">
          {backdrop && <img src={backdrop} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0f12] via-[#0d0f12]/90 to-[#0d0f12]/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0d0f12]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr] gap-8 items-start">
            <div className="rounded-xl overflow-hidden bg-[#1e2430] border border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] aspect-[2/3]">
              {poster ? <img src={poster} alt={series.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-2xl">NO POSTER</div>}
            </div>
            <div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-none tracking-tight" data-testid="series-title">
                {series.title}
                {yearRange && <span className="text-slate-400 font-normal ml-3">({yearRange})</span>}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
                {series.status && <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 uppercase tracking-widest">{series.status}</span>}
                {(series.genres || []).length > 0 && <span>{(series.genres || []).join(", ")}</span>}
                {series.season_count ? <span className="flex items-center gap-1.5"><Tv className="w-3.5 h-3.5" /> {series.season_count} season{series.season_count !== 1 && "s"} · {series.episode_count || 0} ep</span> : null}
              </div>

              {(series.first_air_date || series.last_air_date) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400" data-testid="air-dates-row">
                  {series.first_air_date && (
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-emerald-400" /> First aired <span className="text-slate-200 font-semibold">{fmtDate(series.first_air_date)}</span></span>
                  )}
                  {series.last_air_date && (
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-rose-400" /> Last aired <span className="text-slate-200 font-semibold">{fmtDate(series.last_air_date)}</span></span>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <ScoreCircle score={score100} />
                  <div className="text-sm"><div className="font-bold uppercase tracking-widest text-slate-300 text-xs">User<br/>Score</div></div>
                </div>
                <div className="hidden sm:block h-10 w-px bg-white/10" />
                <button className="w-11 h-11 rounded-full flex items-center justify-center border border-white/20 bg-[#14181f] text-white hover:bg-white/10 transition" title="Watchlist" data-testid="watchlist-btn"><Bookmark className="w-5 h-5" /></button>
                <button className="w-11 h-11 rounded-full flex items-center justify-center border border-white/20 bg-[#14181f] text-white hover:bg-white/10 transition" title="Favorite"><Heart className="w-5 h-5" /></button>
                <button onClick={share} className="w-11 h-11 rounded-full flex items-center justify-center border border-white/20 bg-[#14181f] text-white hover:bg-white/10 transition" title="Share"><Share2 className="w-5 h-5" /></button>
                {series.trailer_url && (
                  <TrailerPlayer url={series.trailer_url} title={`${series.title} — Trailer`} testId="play-trailer-inline">
                    <Button className="bg-white/10 hover:bg-white/15 text-white border border-white/20"><PlayCircle className="w-4 h-4 mr-2" /> Play Trailer</Button>
                  </TrailerPlayer>
                )}
              </div>

              {series.tagline && <p className="mt-6 italic text-slate-400 text-lg" data-testid="series-tagline">{series.tagline}</p>}

              <div className="mt-5">
                <h3 className="font-heading text-2xl font-semibold">Overview</h3>
                <p className="mt-2 text-slate-300 leading-relaxed max-w-3xl" data-testid="series-synopsis">{series.synopsis || "No synopsis available."}</p>
              </div>

              {creators.length > 0 && (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl">
                  {creators.map((d, i) => (
                    <div key={i} data-testid={`creator-${i}`}>
                      <div className="font-semibold text-white">{d.name}</div>
                      <div className="text-xs text-slate-400">{d.role || "Creator"}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                {user && <Button size="sm" variant="outline" onClick={() => navigate(`/series/${id}/edit`)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-series-btn"><Edit className="w-4 h-4 mr-2" /> Edit</Button>}
                {user && (
                  <InlineMediaEditor
                    kind="series"
                    entity={series}
                    onUpdated={(patch) => setSeries((s) => ({ ...s, ...patch }))}
                  />
                )}
                {user && <Button size="sm" variant="outline" onClick={() => setReportOpen(true)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="report-series-btn"><Flag className="w-4 h-4 mr-2" /> Report</Button>}
                {canModerate && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setLockOpen(true)} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"><Lock className="w-4 h-4 mr-2" /> Locks{series.locked_fields?.length ? ` (${series.locked_fields.length})` : ""}</Button>
                    <Button size="sm" variant="outline" onClick={del} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AWARDS */}
      {hasAwards && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" data-testid="awards-strip">
          <div className="rounded-xl bg-gradient-to-r from-emerald-900/40 via-teal-900/40 to-cyan-900/40 border border-emerald-500/20 px-6 py-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 font-heading text-emerald-300 text-xl tracking-wide"><Award className="w-5 h-5" /> AWARDS</div>
            {series.awards_wins ? <div className="text-slate-200"><span className="font-bold text-white">{series.awards_wins}</span> Win{series.awards_wins !== 1 && "s"}</div> : null}
            {series.awards_wins && series.awards_nominations ? <div className="w-px h-6 bg-white/10" /> : null}
            {series.awards_nominations ? <div className="text-slate-200"><span className="font-bold text-white">{series.awards_nominations}</span> Nomination{series.awards_nominations !== 1 && "s"}</div> : null}
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        {/* MAIN */}
        <div className="min-w-0">
          {/* Series Cast */}
          <section data-testid="cast-section">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-heading text-2xl font-bold">Series Cast</h2>
              <Link to="#" className="text-sm text-amber-400 hover:text-amber-300 inline-flex items-center">Full Cast &amp; Crew <ChevronRight className="w-4 h-4" /></Link>
            </div>
            {(!series.main_cast || series.main_cast.length === 0) ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-10 text-center text-slate-500 text-sm">No cast added yet.</div>
            ) : (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
                {series.main_cast.map((c, idx) => (
                  <Link to={`/actor/${c.actor.id}`} key={idx} className="group block flex-shrink-0 w-[140px] rounded-xl overflow-hidden bg-[#14181f] border border-white/5 snap-start hover:border-amber-500/30 transition" data-testid={`series-cast-${c.actor.id}`}>
                    <div className="aspect-[3/4] bg-[#1e2430] overflow-hidden">
                      {c.actor.photo_url ? <img src={fileUrl(c.actor.photo_url)} alt={c.actor.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-xl">{c.actor.name?.[0] || "?"}</div>}
                    </div>
                    <div className="p-2.5">
                      <div className="font-semibold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">{c.actor.name}</div>
                      <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{c.character_name || "—"}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Current Season */}
          {currentSeason && (
            <section className="mt-12" data-testid="current-season-section">
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-2xl font-bold">Current Season</h2>
                <Link to="#seasons" onClick={(e) => { e.preventDefault(); document.querySelector('[data-testid="all-seasons"]')?.scrollIntoView({ behavior: "smooth" }); }} className="text-sm text-amber-400 hover:text-amber-300">View All Seasons</Link>
              </div>
              <div className="mt-3 rounded-xl bg-[#14181f] border border-white/10 p-4 flex gap-4">
                <div className="w-24 flex-shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-[#1e2430]">
                  {currentSeason.poster_url ? <img src={fileUrl(currentSeason.poster_url)} alt="" className="w-full h-full object-cover" /> : (poster ? <img src={poster} alt="" className="w-full h-full object-cover" /> : null)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-xl font-bold">{currentSeason.name || `Season ${currentSeason.season_number}`}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{year(currentSeason.air_date)} · {(currentSeason.episodes || []).length} episodes</div>
                  {currentSeason.overview && <p className="mt-2 text-sm text-slate-300 line-clamp-3">{currentSeason.overview}</p>}
                </div>
              </div>
            </section>
          )}

          {/* All Seasons with expandable Episodes */}
          {sortedSeasons.length > 0 && (
            <section className="mt-12" data-testid="all-seasons">
              <h2 className="font-heading text-2xl font-bold">Seasons &amp; Episodes</h2>
              <div className="mt-4 space-y-3">
                {sortedSeasons.map((s, sIdx) => (
                  <SeasonBlock key={s.season_number} season={s} fallbackPoster={poster} defaultOpen={sIdx === sortedSeasons.length - 1} />
                ))}
              </div>
            </section>
          )}

          {/* Videos */}
          <VideosSection trailerUrl={series.trailer_url} videoUrls={series.video_urls} testIdPrefix="series-video" />

          {/* Collections */}
          {(series.collections || []).length > 0 && (
            <section className="mt-12 space-y-4" data-testid="series-collections-section">
              {series.collections.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </section>
          )}

          {/* Social */}
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
                    <Textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share your thoughts about this series..." className="mt-4 bg-[#0d0f12] border-white/10 text-white" rows={3} data-testid="review-text-input" />
                    <Button type="submit" className="mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="submit-review-btn">Submit Review</Button>
                  </form>
                ) : (
                  <div className="rounded-xl bg-[#14181f] border border-white/10 p-5 text-slate-400 text-sm">
                    <Link to="/login" className="text-amber-400 hover:text-amber-300 font-medium">Sign in</Link> to rate this series.
                  </div>
                )}
                <div className="mt-6 space-y-3" data-testid="reviews-list">
                  {reviews.length === 0 ? (
                    <div className="text-slate-500 text-sm">No reviews yet. Be the first!</div>
                  ) : reviews.map((r) => (
                    <div key={r.id} className="rounded-xl bg-[#14181f] border border-white/10 p-5" data-testid={`review-${r.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400">{r.user_name?.[0] || "?"}</div>
                          <Link to={`/user/${r.user_id}`} className="font-semibold text-white hover:text-amber-400">{r.user_name || "Anonymous"}</Link>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400 font-bold"><Star className="w-4 h-4 fill-amber-400" /> {r.rating}</div>
                      </div>
                      {r.text && <p className="mt-2 text-slate-300 text-sm leading-relaxed">{r.text}</p>}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="discussions" className="mt-6">
                <DiscussionSection entityType="series" entityId={id} embedded />
              </TabsContent>
            </Tabs>
          </section>

          {/* Media */}
          <section className="mt-12" data-testid="media-section">
            <h2 className="font-heading text-2xl font-bold">Media</h2>
            <Tabs defaultValue="backdrops" className="mt-4">
              <TabsList className="bg-transparent border-b border-white/10 rounded-none p-0 h-auto w-full justify-start gap-6">
                <TabsTrigger value="backdrops" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0">Backdrops <span className="ml-1 text-xs text-slate-500">{backdrops.length}</span></TabsTrigger>
                <TabsTrigger value="posters" className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:text-white text-slate-400 px-1 pb-3 pt-0">Posters <span className="ml-1 text-xs text-slate-500">{posters.length}</span></TabsTrigger>
              </TabsList>
              <TabsContent value="backdrops" className="mt-4">
                {backdrops.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500 text-sm">No backdrops yet.</div> : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {backdrops.map((img, i) => <div key={i} className="rounded-lg overflow-hidden aspect-video bg-[#1e2430] border border-white/5"><img src={fileUrl(img)} alt="" className="w-full h-full object-cover" /></div>)}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="posters" className="mt-4">
                {posters.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500 text-sm">No poster images yet.</div> : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {posters.map((img, i) => <div key={i} className="rounded-lg overflow-hidden aspect-[2/3] bg-[#1e2430] border border-white/5"><img src={fileUrl(img)} alt="" className="w-full h-full object-cover" /></div>)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </section>

          <SimilarSection kind="series" entityId={id} />

          <section className="mt-12">
            <EditHistoryPanel key={historyKey} entityType="series" entityId={id} onReverted={load} />
          </section>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-6" data-testid="series-sidebar">
          {series.trailer_url && (
            <TrailerPlayer url={series.trailer_url} title={`${series.title} — Trailer`} testId="play-trailer-sidebar">
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11"><PlayCircle className="w-5 h-5 mr-2" /> Watch Trailer</Button>
            </TrailerPlayer>
          )}

          <div className="rounded-xl bg-[#14181f] border border-white/10 divide-y divide-white/5 text-sm">
            <div className="p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Status</div>
              <div className="mt-1 font-semibold" data-testid="sidebar-status">{series.status || "—"}</div>
            </div>
            {(series.network || series.network_logo_url) && (
              <div className="p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500">Network</div>
                <div className="mt-1 font-semibold flex items-center gap-2" data-testid="sidebar-network">
                  {series.network_logo_url && <img src={fileUrl(series.network_logo_url)} alt="" className="h-6 max-w-[100px] object-contain" />}
                  {series.network && <span>{series.network}</span>}
                </div>
              </div>
            )}
            <div className="p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Type</div>
              <div className="mt-1 font-semibold" data-testid="sidebar-type">{series.type || "Scripted"}</div>
            </div>
            <div className="p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Original Language</div>
              <div className="mt-1 font-semibold" data-testid="sidebar-language">{series.original_language || "—"}</div>
            </div>
          </div>

          <div className="rounded-xl bg-[#14181f] border border-white/10 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">Keywords</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(series.keywords || []).length === 0 ? <span className="text-slate-500 text-xs">No keywords yet</span> : (series.keywords || []).map((k) => (
                <Badge key={k} className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-md text-xs" data-testid={`keyword-${k}`}>{k}</Badge>
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
            {stats.contributors.length === 0 ? <div className="mt-3 text-xs text-slate-500">No contributors yet.</div> : (
              <div className="mt-3 space-y-2">
                {stats.contributors.map((c) => (
                  <Link to={`/user/${c.user_id}`} key={c.user_id} className="flex items-center gap-3 hover:bg-white/5 rounded-lg p-1.5 -m-1.5 transition" data-testid={`contributor-${c.user_id}`}>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1e2430] border border-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                      {c.avatar_url ? <img src={fileUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" /> : (c.name?.[0] || "?")}
                    </div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{c.name}</div></div>
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
            <Button onClick={() => navigate(`/series/${id}/edit`)} variant="outline" className="w-full border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="sidebar-edit-btn"><Edit className="w-4 h-4 mr-2" /> Edit Page</Button>
          )}
          {user && (
            <button onClick={() => setReportOpen(true)} className="w-full text-left text-sm text-slate-400 hover:text-rose-300 flex items-center gap-1.5"><Flag className="w-3.5 h-3.5" /> Report an Issue</button>
          )}
        </aside>
      </div>

      <EntityEditDialog open={editOpen} onOpenChange={setEditOpen} entityType="series" entity={series} onSaved={() => { load(); setHistoryKey((k) => k + 1); }} />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="series" entityId={id} entityTitle={series.title} />
      <LockFieldsDialog open={lockOpen} onOpenChange={setLockOpen} entityType="series" entity={series} onSaved={(d) => { setSeries(d); setHistoryKey((k) => k + 1); }} />
    </div>
  );
}
