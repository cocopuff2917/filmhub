import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Bookmark } from "lucide-react";

export default function Watchlist() {
  const { user, initializing } = useAuth();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (initializing) return;
    if (!user) { navigate("/login"); return; }
    api.get("/watchlist").then((r) => { setMovies(r.data); setLoading(false); });
  }, [user, initializing, navigate]);

  return (
    <div className="min-h-screen bg-[#0a0d12] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_24%),linear-gradient(120deg,#0a0d12_0%,#10151d_45%,#0a0d12_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-300 font-semibold">
            <Bookmark className="w-4 h-4" /> your collection
          </div>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-display text-4xl tracking-wider text-white md:text-5xl">WATCHLIST</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">A personal queue of titles you want to revisit, revisit, and keep close.</p>
            </div>
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200">
              {movies.length} saved
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mt-2">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-[#14181f]/70 px-6 py-12 text-center text-slate-400">Loading...</div>
          ) : movies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#14181f]/60 py-20 text-center shadow-[0_18px_40px_rgba(0,0,0,0.15)]">
              <div className="text-slate-400 mb-4">Your watchlist is empty.</div>
              <Link to="/browse" className="text-amber-400 hover:text-amber-300 font-medium">Browse movies →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {movies.map((item) => item.type === "series"
                ? <SeriesCard key={`series-${item.id}`} series={item} />
                : <MovieCard key={`movie-${item.id}`} movie={item} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
