import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ban, Shield, Star, Edit as EditIcon, User as UserIcon, Settings, History } from "lucide-react";
import EditProfileDialog from "@/components/EditProfileDialog";

// ---------- helpers ----------
function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}
function memberSince(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" }); }
  catch { return ""; }
}

// Circular score badge — 0-100
function ScoreCircle({ score, size = 44, label }) {
  const has = score != null;
  const s = Math.max(0, Math.min(100, Math.round(has ? score : 0)));
  const stroke = !has ? "#64748b" : s >= 70 ? "#22c55e" : s >= 40 ? "#eab308" : "#ef4444";
  const r = size / 2 - 3.5;
  const c = 2 * Math.PI * r;
  const dash = (s / 100) * c;
  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ width: size, height: size }} data-testid={`score-${label}`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="rgba(0,0,0,0.35)" />
          <circle cx={size/2} cy={size/2} r={r} stroke={stroke} strokeWidth="3" fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">{has ? s : "—"}<span className="text-[8px] align-top opacity-70">{has ? "%" : ""}</span></div>
      </div>
      <div className="text-[11px] uppercase tracking-widest text-white/70 leading-tight">Average<br/>{label}</div>
    </div>
  );
}

// Mini bar chart for rating distribution (10 buckets)
function RatingHistogram({ dist = [] }) {
  const max = Math.max(1, ...dist);
  return (
    <div className="mt-2">
      <div className="flex items-end h-16 gap-1">
        {dist.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`Rated ${i+1}: ${v}`}>
            <div className="w-full rounded-t bg-gradient-to-t from-rose-500 to-pink-400" style={{ height: `${(v/max)*100}%`, minHeight: v > 0 ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        {[0,1,2,3,4,5,6,7,8,9,10].map((n) => <span key={n}>{n}</span>)}
      </div>
    </div>
  );
}

// Donut for top genres
function GenreDonut({ genres = [], size = 96 }) {
  const total = genres.reduce((s, g) => s + g.count, 0);
  const palette = ["#ec4899", "#f43f5e", "#f97316", "#a855f7", "#94a3b8"];
  if (!total) return <div className="text-xs text-slate-400">No rated movies yet.</div>;
  const r = size / 2 - 6;
  const inner = r - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        {genres.map((g, i) => {
          const frac = g.count / total;
          const dash = frac * c;
          const seg = (
            <circle key={g.name} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={palette[i % palette.length]} strokeWidth="12"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
          );
          offset += dash;
          return seg;
        })}
        <circle cx={size/2} cy={size/2} r={inner} fill="white" />
      </svg>
      <div className="space-y-1 text-xs">
        {genres.map((g, i) => (
          <div key={g.name} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: palette[i % palette.length] }} />
            <span className="text-slate-700 font-medium">{g.name}</span>
            <span className="text-slate-400">· {g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Stacked area chart for 30-day activity
function Activity30d({ points = [] }) {
  const width = 900, height = 220, padX = 8, padY = 20;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const max = Math.max(1, ...points.map((p) => p.movie + p.series + p.actor));
  const step = points.length > 1 ? w / (points.length - 1) : 0;

  const [visible, setVisible] = useState({ movie: true, series: true, actor: true });
  const y = (v) => padY + h - (v / max) * h;

  const buildArea = (fn) => {
    const top = points.map((p, i) => `${i === 0 ? "M" : "L"} ${padX + i * step} ${y(fn(p))}`).join(" ");
    return `${top} L ${padX + (points.length - 1) * step} ${padY + h} L ${padX} ${padY + h} Z`;
  };

  const stack = (p) => (visible.movie ? p.movie : 0) + (visible.series ? p.series : 0) + (visible.actor ? p.actor : 0);
  const stackMovies = (p) => visible.movie ? p.movie : 0;
  const stackMovSer = (p) => (visible.movie ? p.movie : 0) + (visible.series ? p.series : 0);

  const labels = useMemo(() => {
    const step = Math.max(1, Math.floor(points.length / 6));
    return points.map((p, i) => i % step === 0 || i === points.length - 1 ? p.date.slice(5) : null);
  }, [points]);

  return (
    <div>
      <div className="flex items-center justify-end gap-4 mb-2 text-xs">
        <button onClick={() => setVisible((v) => ({ ...v, movie: !v.movie }))} className={`flex items-center gap-1.5 ${visible.movie ? "text-pink-500" : "text-slate-400 line-through"}`} data-testid="activity-toggle-movies">
          <span className="w-3 h-3 rounded-sm bg-pink-500" /> Movies
        </button>
        <button onClick={() => setVisible((v) => ({ ...v, series: !v.series }))} className={`flex items-center gap-1.5 ${visible.series ? "text-teal-500" : "text-slate-400 line-through"}`} data-testid="activity-toggle-tv">
          <span className="w-3 h-3 rounded-sm bg-teal-500" /> TV
        </button>
        <button onClick={() => setVisible((v) => ({ ...v, actor: !v.actor }))} className={`flex items-center gap-1.5 ${visible.actor ? "text-indigo-500" : "text-slate-400 line-through"}`} data-testid="activity-toggle-people">
          <span className="w-3 h-3 rounded-sm bg-indigo-500" /> People
        </button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56" data-testid="activity-chart">
        <defs>
          <linearGradient id="a-actor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.4"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient>
          <linearGradient id="a-series" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity="0.5"/><stop offset="100%" stopColor="#14b8a6" stopOpacity="0"/></linearGradient>
          <linearGradient id="a-movie" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ec4899" stopOpacity="0.6"/><stop offset="100%" stopColor="#ec4899" stopOpacity="0"/></linearGradient>
        </defs>
        {/* Grid line */}
        <line x1={padX} x2={width - padX} y1={padY + h} y2={padY + h} stroke="#e5e7eb" strokeDasharray="2 3" />
        {visible.actor && <path d={buildArea(stack)} fill="url(#a-actor)" stroke="#6366f1" strokeWidth="1.5" />}
        {visible.series && <path d={buildArea(stackMovSer)} fill="url(#a-series)" stroke="#14b8a6" strokeWidth="1.5" />}
        {visible.movie && <path d={buildArea(stackMovies)} fill="url(#a-movie)" stroke="#ec4899" strokeWidth="1.5" />}
        {/* x labels */}
        {points.map((p, i) => labels[i] ? (
          <text key={p.date} x={padX + i * step} y={height - 4} fontSize="9" textAnchor="middle" fill="#94a3b8">{labels[i]}</text>
        ) : null)}
      </svg>
    </div>
  );
}

// ---------- Main component ----------
export default function UserProfile() {
  const { id } = useParams();
  const { user: current } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    try { const r = await api.get(`/users/${id}`); setProfile(r.data); }
    catch { setProfile({ notFound: true }); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const isSelf = current && current.id === id;

  if (!profile) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;
  if (profile.notFound) return <div className="max-w-6xl mx-auto px-4 py-20 text-slate-500">User not found.</div>;

  // Suspended placeholder for non-mod viewers
  if (profile.suspended_placeholder) {
    const sInitial = (profile.name || "?")[0]?.toUpperCase();
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <section className="relative overflow-hidden" data-testid="user-suspended-placeholder" style={{ background: "radial-gradient(1200px 380px at 10% -20%, #1e293b 0%, #0f172a 55%, #020617 100%)" }}>
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <div className="mx-auto w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-white font-display text-4xl border-4 border-white/10 shadow-lg bg-slate-700 opacity-70" aria-hidden>
              <span>{sInitial}</span>
            </div>
            <h1 className="mt-6 font-heading text-2xl sm:text-3xl font-bold text-white" data-testid="user-suspended-title">{profile.name || "This user"} is currently suspended</h1>
            <p className="mt-3 text-sm text-slate-300 max-w-xl mx-auto">Their profile, reviews, and forum activity are temporarily hidden from the public while the suspension is active.</p>
            <div className="mt-6">
              <Link to="/" className="inline-flex items-center text-sm px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-black font-semibold" data-testid="suspended-back-home-btn">
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const avatarBg = "#e11d48"; // rose-600 like reference
  const initial = (profile.name || "?")[0]?.toUpperCase();
  const activity = profile.daily_activity_30d || [];
  const recent = profile.recent_entities || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ============= HERO ============= */}
      <section className="relative overflow-hidden" data-testid="user-hero" style={{ background: "radial-gradient(1200px 380px at 10% -20%, #1e293b 0%, #0f172a 55%, #020617 100%)" }}>
        {/* decorative accents */}
        <svg className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="none">
          <line x1="55%" y1="0" x2="80%" y2="30%" stroke="#e11d48" strokeWidth="2" />
          <line x1="70%" y1="0" x2="95%" y2="25%" stroke="#e11d48" strokeWidth="2" />
          <line x1="60%" y1="10%" x2="88%" y2="45%" stroke="#e11d48" strokeWidth="1.5" opacity="0.6" />
        </svg>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-display text-5xl border-4 border-white/10 shadow-lg" style={{ background: profile.avatar_url ? "transparent" : avatarBg }}>
              {profile.avatar_url ? (
                <img src={fileUrl(profile.avatar_url)} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span data-testid="user-initial">{initial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white truncate" data-testid="user-name">{profile.name}</h1>
                {profile.custom_role ? (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded border uppercase tracking-widest font-semibold"
                    style={{ color: profile.custom_role.color, borderColor: profile.custom_role.color + "66", background: profile.custom_role.color + "22" }}
                    data-testid="user-custom-role"
                  >
                    {profile.custom_role.name}
                  </span>
                ) : profile.role !== "user" ? (
                  <Badge className="bg-white/10 border-white/10 text-white text-[10px] uppercase" data-testid="user-role">
                    <Shield className="w-3 h-3 mr-1" /> {profile.role}
                  </Badge>
                ) : null}
                {profile.is_suspended && (
                  <Badge className="bg-rose-500/15 text-rose-200 border-rose-500/40" data-testid="user-suspended-badge">
                    <Ban className="w-3 h-3 mr-1" /> Suspended
                  </Badge>
                )}
              </div>
              <div className="text-sm text-white/70 mt-1">Member since {memberSince(profile.created_at)}</div>
              <div className="mt-3 flex items-center gap-5 flex-wrap">
                <ScoreCircle score={profile.avg_movie_rating} label="Movie Score" />
                <div className="w-px h-8 bg-white/15" />
                <ScoreCircle score={profile.avg_series_rating} label="TV Score" />
                {isSelf && (
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="ml-auto border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white h-8" data-testid="edit-profile-btn">
                    <Settings className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
                  </Button>
                )}
              </div>
            </div>
          </div>

          {profile.is_suspended && (
            <div className="mt-6 rounded-lg bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200 max-w-2xl" data-testid="user-suspended-panel">
              <div className="font-semibold mb-1">This account is currently suspended.</div>
              {profile.suspension_reason && <div className="text-rose-300/80">Reason: {profile.suspension_reason}</div>}
              {profile.suspended_until === "permanent"
                ? <div className="text-rose-300/80 text-xs mt-1">Duration: permanent</div>
                : profile.suspended_until
                ? <div className="text-rose-300/80 text-xs mt-1">Until: {profile.suspended_until.slice(0, 19).replace("T", " ")}</div>
                : null}
              <div className="mt-2 text-xs text-slate-400">Only moderators and the user themselves can see this panel.</div>
            </div>
          )}

          {Array.isArray(profile.suspension_history) && profile.suspension_history.length > 0 && (
            <div className="mt-6 rounded-lg bg-amber-500/5 border border-amber-500/30 p-4 text-sm max-w-2xl" data-testid="user-suspension-history">
              <div className="flex items-center gap-2 mb-3">
                <Ban className="w-3.5 h-3.5 text-amber-300" />
                <div className="font-semibold text-amber-200 uppercase tracking-widest text-[11px]">Suspension History</div>
                <span className="text-[10px] text-amber-300/70">· Moderators & admins only</span>
              </div>
              <ul className="space-y-2.5">
                {profile.suspension_history.map((h) => {
                  const label = h.action === "unsuspend" ? "Unsuspended" : h.action === "suspend-update" ? "Updated" : "Suspended";
                  const color = h.action === "unsuspend" ? "text-emerald-300" : "text-rose-300";
                  return (
                    <li key={h.id} className="border-l-2 border-amber-500/40 pl-3" data-testid={`sus-history-${h.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold ${color}`}>{label}</span>
                        <span className="text-xs text-white/60">by {h.user_name || "—"}</span>
                        <span className="text-xs text-white/40">· {timeAgo(h.created_at)}</span>
                      </div>
                      {h.summary && <div className="text-xs text-white/70 mt-0.5">{h.summary}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {profile.bio && (
            <div className="mt-4 text-white/80 text-sm max-w-2xl leading-relaxed" data-testid="user-bio">{profile.bio}</div>
          )}
        </div>
      </section>

      {/* ============= SUB NAV ============= */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs defaultValue="overview">
            <TabsList className="bg-transparent p-0 h-auto rounded-none w-full justify-center gap-8">
              <TabsTrigger value="overview" className="text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 px-1 py-3 text-sm font-medium" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="reviews" className="text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 px-1 py-3 text-sm font-medium" data-testid="tab-reviews">Reviews</TabsTrigger>
              <TabsTrigger value="edits" className="text-slate-500 data-[state=active]:text-slate-900 data-[state=active]:bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 px-1 py-3 text-sm font-medium" data-testid="tab-edits">Edit History</TabsTrigger>
            </TabsList>

            {/* ============= OVERVIEW TAB ============= */}
            <TabsContent value="overview" className="py-8 space-y-8">
              {/* Stats row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6" data-testid="stats-row">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500">Total Edits</div>
                  <div className="mt-1 font-heading text-4xl font-bold text-rose-500" data-testid="total-edits">{(profile.edit_count || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500">Total Ratings</div>
                  <div className="mt-1 font-heading text-4xl font-bold text-rose-500" data-testid="total-ratings">{profile.total_ratings || 0}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500">Rating Overview</div>
                  <RatingHistogram dist={profile.rating_distribution || []} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500">Most Watched Genres</div>
                  <div className="mt-2"><GenreDonut genres={profile.top_genres || []} /></div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-heading text-lg font-bold text-slate-900">Recent Activity</h2>
                  <a href="#edits-tab" onClick={(e) => { e.preventDefault(); document.querySelector('[data-testid="tab-edits"]')?.click(); }} className="text-xs text-rose-500 hover:text-rose-600">View More</a>
                </div>
                {recent.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-200 py-8 text-center text-slate-400 text-sm">No recent activity yet.</div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="recent-activity">
                    {recent.slice(0, 5).map((it) => {
                      const path = it.entity_type === "series" ? "/series/" : it.entity_type === "actor" ? "/actor/" : "/movie/";
                      return (
                        <Link to={`${path}${it.entity_id}`} key={`${it.entity_type}-${it.entity_id}`} className="group rounded-lg overflow-hidden border border-slate-200 bg-white hover:shadow-md transition" data-testid={`recent-${it.entity_id}`}>
                          <div className="aspect-video bg-slate-100 overflow-hidden">
                            {it.poster_url ? <img src={fileUrl(it.poster_url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">?</div>}
                          </div>
                          <div className="p-2.5">
                            <div className="font-semibold text-sm text-slate-900 truncate">{it.entity_title || "(deleted)"}</div>
                            <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                              <span>{timeAgo(it.last_at)}</span>
                              <span>{it.edit_count} edit{it.edit_count !== 1 && "s"}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 30 Day Activity chart */}
              <div className="rounded-xl bg-white border border-slate-200 p-5">
                <h2 className="font-heading text-lg font-bold text-slate-900">30 Day Activity</h2>
                <Activity30d points={activity} />
              </div>
            </TabsContent>

            {/* ============= REVIEWS TAB ============= */}
            <TabsContent value="reviews" className="py-8">
              {(!profile.reviews || profile.reviews.length === 0) ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-400 text-sm">No rated movies yet.</div>
              ) : (
                <div className="space-y-3">
                  {profile.reviews.map((r) => (
                    <Link to={`/movie/${r.movie_id}`} key={r.id} className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 p-4 hover:border-rose-300 hover:shadow-sm transition" data-testid={`user-review-${r.id}`}>
                      <div className="w-12 h-16 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                        {r.movie_poster_url && <img src={fileUrl(r.movie_poster_url)} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-slate-900 truncate">{r.movie_title || "(deleted movie)"}</span>
                          <span className="flex items-center gap-1 text-amber-500 font-bold"><Star className="w-4 h-4 fill-amber-500" /> {r.rating}</span>
                        </div>
                        {r.text && <div className="text-sm text-slate-500 mt-1 line-clamp-2">{r.text}</div>}
                        <div className="text-xs text-slate-400 mt-0.5">{timeAgo(r.created_at)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ============= EDITS TAB ============= */}
            <TabsContent value="edits" className="py-8">
              <div className="flex items-center gap-2 text-slate-900 font-heading text-lg font-bold"><History className="w-4 h-4" /> Edit History</div>
              {(!profile.edits || profile.edits.length === 0) ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-400 text-sm">No edits recorded yet.</div>
              ) : (
                <ol className="mt-4 relative border-l-2 border-slate-200 ml-2 space-y-3">
                  {profile.edits.map((e) => {
                    const path = e.entity_type === "series" ? "/series/" : e.entity_type === "actor" ? "/actor/" : "/movie/";
                    return (
                      <li key={e.id} className="pl-4 relative" data-testid={`user-edit-${e.id}`}>
                        <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-white" />
                        <div className="text-sm">
                          <Link to={`${path}${e.entity_id}`} className="text-slate-900 font-semibold hover:text-rose-500">{e.entity_title || "(deleted)"}</Link>
                          <span className="ml-2 text-[10px] uppercase tracking-widest text-rose-500 font-semibold">{e.action}</span>
                          <span className="ml-2 text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                        </div>
                        {e.summary && <div className="text-xs text-slate-500 mt-0.5">{e.summary}</div>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
        onSaved={load}
      />
    </div>
  );
}
