import { Link } from "react-router-dom";
import { Star, Tv } from "lucide-react";
import { fileUrl } from "@/lib/api";
import ImageWithFallback from "@/components/ImageWithFallback";

export default function SeriesCard({ series, testid }) {
  const startYear = series.first_air_date ? series.first_air_date.slice(0, 4) : "";
  const endYear = series.last_air_date ? series.last_air_date.slice(0, 4) : "";
  const years = startYear ? (endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear) : "";
  const poster = series.poster_url ? fileUrl(series.poster_url) : null;
  const nextEpisode = series.next_episode;
  const nextEpisodeDate = nextEpisode?.air_date
    ? new Date(`${nextEpisode.air_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <Link
      to={`/series/${series.id}`}
      className="group block overflow-hidden rounded-2xl border border-white/10 bg-[#14181f]/80 shadow-[0_20px_45px_rgba(0,0,0,0.14)] transition hover:border-amber-500/40 hover:-translate-y-0.5"
      data-testid={testid || `series-card-${series.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[#1e2430]">
        {poster ? (
          <ImageWithFallback
            src={poster}
            alt={series.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            fallback={<div className="flex h-full w-full items-center justify-center text-2xl font-display text-slate-600">NO POSTER</div>}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-display text-slate-600">
            NO POSTER
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-amber-500/40 bg-black/70 px-2 py-1 backdrop-blur-sm">
          <Tv className="h-3 w-3 text-amber-400" />
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white">Series</span>
        </div>
        {series.avg_rating != null && (
          <div className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
            {series.avg_rating}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-heading text-sm font-semibold text-white transition-colors group-hover:text-amber-300 line-clamp-1">
          {series.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <span>{years || "—"}</span>
          {series.season_count > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{series.season_count} season{series.season_count !== 1 && "s"}</span>
            </>
          )}
        </div>
        {nextEpisode && (
          <div className="mt-2 border-t border-white/10 pt-2 text-[11px]" data-testid={`series-next-episode-${series.id}`}>
            <div className="font-medium text-amber-300">
              S{nextEpisode.season_number} E{nextEpisode.episode_number}{nextEpisode.name ? ` · ${nextEpisode.name}` : ""}
            </div>
            {nextEpisodeDate && <time className="mt-0.5 block text-slate-400" dateTime={nextEpisode.air_date}>Airs {nextEpisodeDate}</time>}
          </div>
        )}
      </div>
    </Link>
  );
}
