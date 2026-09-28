import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import { Calendar, Film, Cake } from "lucide-react";

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
    (async () => {
      const r = await api.get(`/actors/${id}`);
      setActor(r.data);
    })();
  }, [id]);

  if (!actor) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading...</div>;

  const photo = actor.photo_url ? fileUrl(actor.photo_url) : null;

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
                <span className="flex items-center gap-2" data-testid="actor-film-count">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-white">{actor.movies?.length || 0}</span>
                  <span className="text-slate-500">film{(actor.movies?.length || 0) !== 1 && "s"}</span>
                </span>
              </div>
              {actor.bio && <p className="mt-6 text-slate-300 leading-relaxed max-w-3xl">{actor.bio}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">Filmography</h2>
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
    </div>
  );
}
