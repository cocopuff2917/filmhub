import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import ImageWithFallback from "@/components/ImageWithFallback";

function CreditPerson({ actor, subtitle, testid }) {
  if (!actor) return null;
  return (
    <div className="flex items-center gap-3 border-b border-white/10 py-3" data-testid={testid}>
      <Link to={`/actor/${actor.id}`} className="h-14 w-11 flex-shrink-0 overflow-hidden rounded bg-[#1e2430]">
        <ImageWithFallback
          src={fileUrl(actor.photo_url)}
          fallbackSrc={fileUrl(actor.photo_url, "jpeg")}
          alt={actor.name}
          className="h-full w-full object-cover"
          fallback={<div className="flex h-full w-full items-center justify-center text-slate-500">{actor.name?.[0] || "?"}</div>}
        />
      </Link>
      <div className="min-w-0">
        <Link to={`/actor/${actor.id}`} className="font-semibold text-white hover:text-amber-400">{actor.name}</Link>
        {subtitle && <div className="mt-0.5 text-sm text-slate-400">{subtitle}</div>}
      </div>
    </div>
  );
}

function guestCredits(series) {
  const credits = new Map();
  for (const season of series.seasons || []) {
    for (const episode of season.episodes || []) {
      for (const guest of episode.guest_stars || []) {
        if (!guest.actor?.id) continue;
        const key = `${guest.actor.id}:${guest.character_name || ""}`;
        if (!credits.has(key)) credits.set(key, { actor: guest.actor, character: guest.character_name, episodes: [] });
        credits.get(key).episodes.push(
          `S${String(season.season_number).padStart(2, "0")}E${String(episode.episode_number).padStart(2, "0")}${episode.name ? ` · ${episode.name}` : ""}`
        );
      }
    }
  }
  return Array.from(credits.values());
}

export default function Credits({ kind }) {
  const { id } = useParams();
  const isSeries = kind === "series";
  const [entity, setEntity] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setEntity(null);
    setNotFound(false);
    api.get(`/${isSeries ? "series" : "movies"}/${id}`)
      .then((response) => { if (active) setEntity(response.data); })
      .catch(() => { if (active) setNotFound(true); });
    return () => { active = false; };
  }, [id, isSeries]);

  if (notFound) return <main className="mx-auto max-w-6xl px-4 py-20 text-slate-400">Credits not found.</main>;
  if (!entity) return <main className="mx-auto max-w-6xl px-4 py-20 text-slate-400">Loading credits…</main>;

  const backPath = `/${isSeries ? "series" : "movie"}/${id}`;
  const guests = isSeries ? guestCredits(entity) : [];
  const guestActorIds = new Set(
    (entity.seasons || []).flatMap((season) => (season.episodes || []).flatMap((episode) => (
      (episode.guest_stars || []).map((guest) => String(guest.actor_id || guest.actor?.id || ""))
    ))).filter(Boolean)
  );
  const mainCast = isSeries
    ? (entity.main_cast || []).filter((credit) => {
      const actorId = credit?.actor?.id || credit?.actor_id;
      return actorId && !credit.recurring && credit.kind !== "guest" && !guestActorIds.has(String(actorId));
    })
    : entity.cast || [];
  const crew = isSeries ? entity.creators || [] : entity.crew || [];

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0a0d14] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to={backPath} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white" data-testid="credits-back-link">
          <ArrowLeft className="h-4 w-4" /> Back to {isSeries ? "series" : "movie"}
        </Link>
        <header className="mt-6 border-b border-white/10 pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400"><Users className="h-4 w-4" /> Full Credits</div>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl" data-testid="credits-title">{entity.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{isSeries ? "TV Series" : "Movie"} cast and crew</p>
        </header>

        <section className="mt-8" data-testid="credits-cast-section">
          <h2 className="font-heading text-2xl font-bold">{isSeries ? "Series Cast" : "Cast"} <span className="text-base font-normal text-slate-500">({mainCast.length})</span></h2>
          {mainCast.length ? (
            <div className="mt-3">
              {mainCast.map((credit, index) => (
                <CreditPerson
                  key={`${credit.actor?.id || credit.actor_id}-${index}`}
                  actor={credit.actor}
                  subtitle={credit.recurring
                    ? `${credit.character_name || "—"} · Recurring guest · ${credit.episode_count} episodes`
                    : credit.character_name || "—"}
                  testid={`credits-cast-${credit.actor?.id || index}`}
                />
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No cast credits listed.</p>}
        </section>

        {isSeries && (
          <section className="mt-10" data-testid="credits-guest-stars-section">
            <h2 className="font-heading text-2xl font-bold">Guest Stars <span className="text-base font-normal text-slate-500">({guests.length})</span></h2>
            {guests.length ? (
              <div className="mt-3">
                {guests.map((credit, index) => (
                  <CreditPerson
                    key={`${credit.actor.id}-${credit.character || ""}-${index}`}
                    actor={credit.actor}
                    subtitle={[credit.character, credit.episodes.join(", ")].filter(Boolean).join(" · ")}
                    testid={`credits-guest-${credit.actor.id}-${index}`}
                  />
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-slate-500">No guest-star credits listed.</p>}
          </section>
        )}

        <section className="mt-10" data-testid="credits-crew-section">
          <h2 className="font-heading text-2xl font-bold">{isSeries ? "Creators" : "Crew"} <span className="text-base font-normal text-slate-500">({crew.length})</span></h2>
          {crew.length ? (
            <div className="mt-3 divide-y divide-white/10">
              {crew.map((member, index) => (
                member.actor?.id ? (
                  <CreditPerson
                    key={`${member.actor.id}-${member.role}-${index}`}
                    actor={member.actor}
                    subtitle={member.role || "Crew"}
                    testid={`credits-crew-${index}`}
                  />
                ) : (
                  <div key={`${member.name}-${member.role}-${index}`} className="flex items-center justify-between gap-4 border-b border-white/10 py-3" data-testid={`credits-crew-${index}`}>
                    <span className="font-semibold text-white">{member.name}</span>
                    <span className="text-sm text-slate-400">{member.role || (isSeries ? "Creator" : "Crew")}</span>
                  </div>
                )
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No crew credits listed.</p>}
        </section>
      </div>
    </main>
  );
}