import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "@/components/MovieCard";
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <Bookmark className="w-4 h-4" /> Your Collection
      </div>
      <h1 className="mt-2 font-heading text-4xl font-bold text-white">Watchlist</h1>
      <p className="mt-2 text-slate-400 text-sm">Movies you saved for later.</p>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate-500">Loading...</div>
        ) : movies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-20 text-center">
            <div className="text-slate-500 mb-4">Your watchlist is empty.</div>
            <Link to="/browse" className="text-amber-400 hover:text-amber-300 font-medium">Browse movies →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
            {movies.map((m) => <MovieCard key={m.id} movie={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}
