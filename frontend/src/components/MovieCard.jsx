import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { fileUrl } from "@/lib/api";
import ImageWithFallback from "@/components/ImageWithFallback";

export default function MovieCard({ movie, testid }) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "";
  const poster = movie.poster_url ? fileUrl(movie.poster_url) : null;

  return (
    <Link
      to={`/movie/${movie.id}`}
      className="group block poster-hover rounded-xl overflow-hidden bg-[#14181f] border border-white/5"
      data-testid={testid || `movie-card-${movie.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[#1e2430]">
        <ImageWithFallback
          src={poster}
          alt={movie.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
          fallback={<div className="w-full h-full flex items-center justify-center text-slate-600 font-display text-2xl">NO POSTER</div>}
        />
        {movie.avg_rating != null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur px-2 py-1 rounded-full">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-white">{movie.avg_rating}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black to-transparent" />
      </div>
      <div className="p-3">
        <div className="font-heading text-white font-semibold line-clamp-1 group-hover:text-amber-400 transition-colors">
          {movie.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
          <span>{year || "—"}</span>
          {movie.genres && movie.genres[0] && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span className="truncate">{movie.genres.slice(0, 2).join(" • ")}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
