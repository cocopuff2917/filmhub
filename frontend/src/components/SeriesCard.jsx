import { Link } from "react-router-dom";
import { Star, Tv } from "lucide-react";
import { fileUrl } from "@/lib/api";

export default function SeriesCard({ series, testid }) {
  const startYear = series.first_air_date ? series.first_air_date.slice(0, 4) : "";
  const endYear = series.last_air_date ? series.last_air_date.slice(0, 4) : "";
  const years = startYear ? (endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear) : "";
  const poster = series.poster_url ? fileUrl(series.poster_url) : null;

  return (
    <Link
      to={`/series/${series.id}`}
      className="group block poster-hover rounded-xl overflow-hidden bg-[#14181f] border border-white/5"
      data-testid={testid || `series-card-${series.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[#1e2430]">
        {poster ? (
          <img src={poster} alt={series.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-2xl">
            NO POSTER
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur px-2 py-1 rounded-full">
          <Tv className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">Series</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black to-transparent" />
      </div>
      <div className="p-3">
        <div className="font-heading text-white font-semibold line-clamp-1 group-hover:text-amber-400 transition-colors">
          {series.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span>{years || "—"}</span>
          {series.season_count > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>{series.season_count} season{series.season_count !== 1 && "s"}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
