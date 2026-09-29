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
        const r = await api.get(endpoint);
        setItems(r.data || []);
      } catch {}
      setLoading(false);
    })();
  }, [kind, entityId]);

  if (loading) return null;
  if (!items.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid="similar-section">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <Sparkles className="w-4 h-4" /> You Might Also Enjoy
      </div>
      <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">
        Related Movies &amp; TV Series
      </h2>
      <p className="mt-1 text-sm text-slate-500">Matched by genre, cast, and release year.</p>
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
        {items.map((it) => {
          const type = it.type || (it.first_air_date || it.seasons ? "series" : "movie");
          return type === "series"
            ? <SeriesCard key={`s-${it.id}`} series={it} />
            : <MovieCard key={`m-${it.id}`} movie={it} />;
        })}
      </div>
    </section>
  );
}
