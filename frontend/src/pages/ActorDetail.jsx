import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Calendar, Film, Cake, Tv, UserPlus } from "lucide-react";

function computeAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatDob(dobStr) {
  if (!dobStr) return "";
  const d = new Date(dobStr);
  if (isNaN(d.getTime())) return dobStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function ActorDetail() {
  const { id } = useParams();
  const [actor, setActor] = useState(null);

  useEffect(() => {
    api.get(`/actors/${id}`).then((r) => setActor(r.data)).catch(() => {});
  }, [id]);

  if (!actor) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const photo = actor.photo_url ? fileUrl(actor.photo_url) : null;
  const totalCredits = (actor.movies?.length || 0) + (actor.series?.length || 0);

  return (
    <div>
      <section className="hero-radial">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-start">
            <div className="rounded-2xl overflow-hidden aspect-square bg-[#1e2430] border border-white/10">
              {photo ? (
                <img src={photo} alt={actor.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-5xl">
                  {actor.name?.[0]}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Actor Profile</div>
              <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-tight text-white" data-testid="actor-name">{actor.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
                {actor.birth_date && (
                  <span className="flex items-center gap-2" data-testid="actor-dob">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-500">Born</span>
                    <span className="font-medium text-white">{formatDob(actor.birth_date)}</span>
                  </span>
                )}
                {actor.birth_date && computeAge(actor.birth_date) != null && (
                  <span className="flex items-center gap-2" data-testid="actor-age">
                    <Cake className="w-4 h-4 text-amber-400" />
                    <span className="font-medium text-white">{computeAge(actor.birth_date)}</span>
                    <span className="text-slate-500">years old</span>
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-white">{totalCredits}</span>
                  <span className="text-slate-500">credit{totalCredits !== 1 && "s"}</span>
                </span>
              </div>
              {actor.bio && <p className="mt-6 text-slate-300 leading-relaxed max-w-3xl">{actor.bio}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Movies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
          <Film className="w-4 h-4" /> Filmography
        </div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Movies</h2>
        {(!actor.movies || actor.movies.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">
            No movies linked yet.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {actor.movies.map((m) => (
              <div key={m.id}>
                <MovieCard movie={m} />
                {m.character_name && (
                  <div className="mt-2 text-xs text-slate-500 px-1">as <span className="text-amber-400">{m.character_name}</span></div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TV Series (main cast) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="actor-series-section">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
          <Tv className="w-4 h-4" /> Series Regular
        </div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">TV Series</h2>
        {(!actor.series || actor.series.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">
            No series credits yet.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {actor.series.map((s) => (
              <div key={s.id}>
                <SeriesCard series={s} />
                {s.character_name && (
                  <div className="mt-2 text-xs text-slate-500 px-1">as <span className="text-amber-400">{s.character_name}</span></div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Guest Appearances */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="actor-guest-section">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
          <UserPlus className="w-4 h-4" /> Guest Appearances
        </div>
        <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">Guest Star Episodes</h2>
        {(!actor.guest_episodes || actor.guest_episodes.length === 0) ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-12 text-center text-slate-500">
            No guest star appearances yet.
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {actor.guest_episodes.map((ge, i) => (
              <Link
                key={i}
                to={`/series/${ge.series_id}`}
                className="flex items-center gap-4 rounded-xl bg-[#14181f] border border-white/10 p-4 hover:border-amber-500/40 hover:bg-amber-500/5 transition"
                data-testid={`guest-episode-${i}`}
              >
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
    </div>
  );
}
