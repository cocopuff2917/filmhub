import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Layers, Film, Tv, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [coll, setColl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/collections/${id}`);
        if (!cancelled) setColl(r.data);
      } catch {
        if (!cancelled) setColl(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="max-w-7xl mx-auto px-4 py-20 text-slate-500">Loading collection…</div>;
  if (!coll) return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center">
      <div className="text-slate-400">Collection not found.</div>
      <Button variant="outline" onClick={() => navigate(-1)} className="mt-4 border-white/10 text-white hover:bg-white/5">Go back</Button>
    </div>
  );

  const backdrop = coll.backdrop_url ? fileUrl(coll.backdrop_url) : "";
  const poster = coll.poster_url ? fileUrl(coll.poster_url) : "";
  const movies = coll.titles.filter((t) => t.kind === "movie");
  const series = coll.titles.filter((t) => t.kind === "series");

  return (
    <div data-testid="collection-detail-page">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: backdrop ? `url(${backdrop})` : undefined, backgroundColor: backdrop ? undefined : "#0d0f12" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#0d0f12]" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-center">
          <div className="rounded-2xl overflow-hidden aspect-[2/3] bg-[#1e2430] border border-white/10 max-w-[220px]">
            {poster ? (
              <img src={poster} alt={coll.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600">
                <Layers className="w-16 h-16" />
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4" /> Collection
            </div>
            <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-tight text-white" data-testid="collection-name">{coll.name}</h1>
            <div className="mt-3 text-sm text-slate-300 flex items-center gap-4 flex-wrap">
              <span>{movies.length} film{movies.length !== 1 && "s"}</span>
              <span>·</span>
              <span>{series.length} series</span>
              <span>·</span>
              <span>{coll.titles.length} total</span>
            </div>
            {coll.description && <p className="mt-4 text-slate-300 leading-relaxed max-w-3xl">{coll.description}</p>}
          </div>
        </div>
      </section>

      {/* Titles */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {coll.titles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-20 text-center text-slate-500">
            No titles in this collection yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {coll.titles.map((t) => (
              <Link
                key={`${t.kind}-${t.id}`}
                to={t.kind === "movie" ? `/movie/${t.id}` : `/series/${t.id}`}
                className="group block"
                data-testid={`collection-title-${t.id}`}
              >
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[#1e2430] border border-white/5 group-hover:border-amber-500/40 transition">
                  {t.poster_url ? (
                    <img src={fileUrl(t.poster_url)} alt={t.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-3xl">{t.title?.[0]}</div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                  {t.kind === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                  <span>{t.kind}</span>
                  {t.year && <span>· {t.year}</span>}
                </div>
                <div className="mt-1 font-semibold text-sm text-white line-clamp-2 group-hover:text-amber-400 transition-colors">{t.title}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
