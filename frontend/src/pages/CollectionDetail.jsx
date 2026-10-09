import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Layers, Film, Tv, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function getCollectionCast(titles, limit = 10) {
  const groups = titles
    .filter((title) => (title.main_cast || []).length > 0)
    .map((title) => ({ title, members: title.main_cast || [] }));
  const cast = [];
  const byActorId = new Map();
  let depth = 0;
  let hasMore = true;

  while (cast.length < limit && hasMore) {
    hasMore = false;
    for (const { title, members } of groups) {
      const member = members[depth];
      if (!member) continue;
      hasMore = true;
      const actorId = member.actor?.id || member.actor_id;
      if (!actorId) continue;
      const existing = byActorId.get(actorId);
      if (existing) {
        if (!existing.credits.some((credit) => credit.titleId === title.id)) {
          existing.credits.push({ titleId: title.id, title: title.title, kind: title.kind, character: member.character_name || "" });
        }
        continue;
      }
      const entry = {
        actorId,
        actor: member.actor || { id: actorId, name: "Unknown actor", photo_url: "" },
        credits: [{ titleId: title.id, title: title.title, kind: title.kind, character: member.character_name || "" }],
      };
      byActorId.set(actorId, entry);
      cast.push(entry);
      if (cast.length >= limit) break;
    }
    depth += 1;
  }
  return cast;
}

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
  const castPreview = getCollectionCast(coll.titles, 10);

  return (
    <div data-testid="collection-detail-page" className="min-h-screen bg-[#0a0d12] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: backdrop ? `url(${backdrop})` : undefined, backgroundColor: backdrop ? undefined : "#0d0f12" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#0a0d12]" />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
          <div className="max-w-[220px] overflow-hidden rounded-2xl border border-amber-500/20 bg-[#14181f]/80 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            {poster ? (
              <img src={poster} alt={coll.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-600">
                <Layers className="h-16 w-16" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-300 font-semibold">
              <Layers className="w-4 h-4" /> collection
            </div>
            <h1 className="mt-2 font-display text-5xl tracking-tight text-white sm:text-6xl" data-testid="collection-name">{coll.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <span>{movies.length} film{movies.length !== 1 && "s"}</span>
              <span>·</span>
              <span>{series.length} series</span>
              <span>·</span>
              <span>{coll.titles.length} total</span>
            </div>
            {coll.description && <p className="mt-4 max-w-3xl leading-relaxed text-slate-300">{coll.description}</p>}
          </div>
        </div>
      </section>

      {castPreview.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8" data-testid="collection-cast-previews">
          <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-3">
            <h2 className="font-heading text-xl font-bold text-white">Cast across this collection</h2>
            <span className="text-xs text-slate-500">{castPreview.length} of 10</span>
          </div>
          <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {castPreview.map(({ actorId, actor, credits }) => (
              <div key={actorId} className="flex min-w-0 items-center gap-3 border-b border-white/5 py-2" data-testid={`collection-cast-${actorId}`}>
                <Link to={`/actor/${actorId}`} className="group flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1e2430] text-sm text-slate-400">
                    {actor.photo_url ? <img src={fileUrl(actor.photo_url)} alt="" className="h-full w-full object-cover" loading="lazy" /> : (actor.name?.[0] || "?")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white group-hover:text-amber-300">{actor.name || "Unknown actor"}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {credits.slice(0, 2).map((credit) => credit.title).join(", ")}{credits.length > 2 ? ` +${credits.length - 2} more` : ""}
                    </span>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {coll.titles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#14181f]/60 py-20 text-center text-slate-500">
            No titles in this collection yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-6">
            {coll.titles.map((t) => (
              <Link
                key={`${t.kind}-${t.id}`}
                to={t.kind === "movie" ? `/movie/${t.id}` : `/series/${t.id}`}
                className="group block rounded-2xl border border-white/10 bg-[#14181f]/80 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.14)] transition hover:-translate-y-0.5 hover:border-amber-500/40"
                data-testid={`collection-title-${t.id}`}
              >
                <div className="aspect-[2/3] overflow-hidden rounded-xl bg-[#1e2430]">
                  {t.poster_url ? (
                    <img src={fileUrl(t.poster_url)} alt={t.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-display text-slate-600">{t.title?.[0]}</div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                  {t.kind === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                  <span>{t.kind}</span>
                  {t.year && <span>· {t.year}</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold text-white transition-colors group-hover:text-amber-300">{t.title}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
