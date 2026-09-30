import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";
import { Calendar, Film, Cake, Tv, UserPlus, Edit, Trash2, MapPin, Skull, ImageIcon, Flag, Lock } from "lucide-react";
import { toast } from "sonner";
import EntityEditDialog from "@/components/EntityEditDialog";
import EditHistoryPanel from "@/components/EditHistoryPanel";
import ReportDialog from "@/components/ReportDialog";
import LockFieldsDialog from "@/components/LockFieldsDialog";

function computeAge(dobStr, dodStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const endRef = dodStr ? new Date(dodStr) : new Date();
  if (isNaN(endRef.getTime())) return null;
  let age = endRef.getFullYear() - dob.getFullYear();
  const m = endRef.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && endRef.getDate() < dob.getDate())) age--;
  return age;
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function ActorDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [actor, setActor] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const load = async () => { try { const r = await api.get(`/actors/${id}`); setActor(r.data); } catch {} };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const canDelete = user && ["moderator", "admin"].includes(user.role);

  const del = async () => {
    if (!window.confirm(`Delete ${actor.name}?`)) return;
    try { await api.delete(`/actors/${id}`); toast.success("Deleted"); navigate("/"); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!actor) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const photo = actor.photo_url ? fileUrl(actor.photo_url) : null;
  const isDeceased = !!actor.death_date;
  const age = computeAge(actor.birth_date, actor.death_date);
  const totalCredits = (actor.movies?.length || 0) + (actor.series?.length || 0);

  return (
    <div>
      <section className="hero-radial">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-start">
            <div className="rounded-2xl overflow-hidden aspect-[2/3] bg-[#1e2430] border border-white/10">
              {photo ? <img src={photo} alt={actor.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-5xl">{actor.name?.[0]}</div>}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <div className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Actor Profile</div>
                {isDeceased && <span className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1"><Skull className="w-3 h-3" /> Deceased</span>}
              </div>
              <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-tight text-white" data-testid="actor-name">{actor.name}</h1>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-300 max-w-2xl">
                {actor.birth_date && (
                  <div className="flex items-center gap-2" data-testid="actor-dob">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-500">Born</span>
                    <span className="font-medium text-white">{formatDate(actor.birth_date)}</span>
                  </div>
                )}
                {actor.place_of_birth && (
                  <div className="flex items-center gap-2" data-testid="actor-pob">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-500">in</span>
                    <span className="font-medium text-white">{actor.place_of_birth}</span>
                  </div>
                )}
                {actor.death_date && (
                  <div className="flex items-center gap-2" data-testid="actor-dod">
                    <Skull className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-500">Died</span>
                    <span className="font-medium text-white">{formatDate(actor.death_date)}</span>
                  </div>
                )}
                {actor.place_of_death && (
                  <div className="flex items-center gap-2" data-testid="actor-pod">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-500">in</span>
                    <span className="font-medium text-white">{actor.place_of_death}</span>
                  </div>
                )}
                {age != null && (
                  <div className="flex items-center gap-2" data-testid="actor-age">
                    <Cake className="w-4 h-4 text-amber-400" />
                    <span className="font-medium text-white">{age}</span>
                    <span className="text-slate-500">{isDeceased ? "years old at death" : "years old"}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-white">{totalCredits}</span>
                  <span className="text-slate-500">credit{totalCredits !== 1 && "s"}</span>
                </div>
              </div>

              {actor.bio && <p className="mt-6 text-slate-300 leading-relaxed max-w-3xl">{actor.bio}</p>}

              <div className="mt-6 flex flex-wrap gap-2">
                {user && (
                  <Button variant="outline" onClick={() => setEditOpen(true)} className="border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="edit-actor-btn">
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                )}
                {user && (
                  <Button variant="outline" onClick={() => setReportOpen(true)} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="report-actor-btn">
                    <Flag className="w-4 h-4 mr-2" /> Report a Problem
                  </Button>
                )}
                {canDelete && (
                  <>
                    <Button variant="outline" onClick={() => setLockOpen(true)} className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200" data-testid="lock-actor-btn">
                      <Lock className="w-4 h-4 mr-2" /> Locks{actor.locked_fields?.length ? ` (${actor.locked_fields.length})` : ""}
                    </Button>
                    <Button variant="outline" onClick={del} className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" data-testid="delete-actor-btn">
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Movies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><Film className="w-4 h-4" /> Filmography</div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Movies</h2>
        {(!actor.movies || actor.movies.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No movies linked yet.</div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {actor.movies.map((m) => (
              <div key={m.id}>
                <MovieCard movie={m} />
                {m.character_name && <div className="mt-2 text-xs text-slate-500 px-1">as <span className="text-amber-400">{m.character_name}</span></div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TV Series */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><Tv className="w-4 h-4" /> Series Regular</div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">TV Series</h2>
        {(!actor.series || actor.series.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No series credits yet.</div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {actor.series.map((s) => (
              <div key={s.id}>
                <SeriesCard series={s} />
                {s.character_name && <div className="mt-2 text-xs text-slate-500 px-1">as <span className="text-amber-400">{s.character_name}</span></div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Guest Appearances */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><UserPlus className="w-4 h-4" /> Guest Appearances</div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Guest Star Episodes</h2>
        {(!actor.guest_episodes || actor.guest_episodes.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">No guest star appearances yet.</div>
        ) : (
          <div className="mt-6 space-y-2">
            {actor.guest_episodes.map((ge, i) => (
              <Link key={i} to={`/series/${ge.series_id}`} className="flex items-center gap-4 rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition">
                <div className="w-12 h-16 rounded bg-[#1e2430] overflow-hidden flex-shrink-0">
                  {ge.series_poster_url && <img src={fileUrl(ge.series_poster_url)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-heading text-white font-semibold truncate">{ge.series_title}</span>
                    <span className="text-xs text-amber-400 font-mono">S{String(ge.season_number).padStart(2, "0")}E{String(ge.episode_number).padStart(2, "0")}</span>
                  </div>
                  <div className="text-sm text-slate-300 truncate">{ge.episode_name || `Episode ${ge.episode_number}`}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    as <span className="text-amber-400">{ge.character_name}</span>
                    {ge.air_date && <span> • {ge.air_date}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Gallery */}
      {actor.gallery && actor.gallery.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="actor-gallery-section">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold"><ImageIcon className="w-4 h-4" /> Photos</div>
          <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Gallery</h2>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {actor.gallery.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden aspect-square bg-[#1e2430] border border-white/5">
                <img src={fileUrl(img)} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <EditHistoryPanel key={historyKey} entityType="actor" entityId={id} onReverted={load} />
      </section>

      <EntityEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entityType="actor"
        entity={actor}
        onSaved={() => { load(); setHistoryKey((k) => k + 1); }}
      />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="actor" entityId={id} entityTitle={actor.name} />
      <LockFieldsDialog open={lockOpen} onOpenChange={setLockOpen} entityType="actor" entity={actor} onSaved={(d) => { setActor((prev) => ({ ...prev, ...d })); setHistoryKey((k) => k + 1); }} />
    </div>
  );
}
