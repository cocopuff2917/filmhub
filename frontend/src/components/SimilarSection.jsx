import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Sparkles } from "lucide-react";

export default function SimilarSection({ kind, entityId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const endpoint = kind === "movie" ? `/movies/${entityId}/similar` : `/series/${entityId}/similar`;
        const r = await api.get(`${endpoint}?limit=10`);
        setItems((r.data || []).slice(0, 10));
      } catch {}
      setLoading(false);
    })();
  }, [kind, entityId]);

  const title = kind === "movie" ? "Related Movies" : "Related TV Series";
  const copy = kind === "movie"
    ? "Movies matched by shared cast, release year, genres, and collection."
    : "TV series matched by shared cast, premiere year, genres, and collection.";

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="similar-section">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <Sparkles className="w-4 h-4" /> You Might Also Enjoy
      </div>
      <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{copy}</p>

      {loading ? (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-slate-500 text-sm" data-testid="similar-empty">
          No related {kind === "movie" ? "movies" : "TV series"} found yet. As the catalog grows, matches by cast, year, genre, and collection will show up here.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {items.map((it) => (
            kind === "series"
              ? <SeriesCard key={`s-${it.id}`} series={it} />
              : <MovieCard key={`m-${it.id}`} movie={it} />
          ))}
        </div>
      )}
    </section>
  );
}
