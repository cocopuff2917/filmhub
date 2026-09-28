import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const [movies, setMovies] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") || "");
  const genre = params.get("genre") || "all";
  const year = params.get("year") || "all";
  const sort = params.get("sort") || "recent";

  useEffect(() => {
    api.get("/genres").then((r) => setGenres(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const query = {};
      if (params.get("q")) query.q = params.get("q");
      if (params.get("genre") && params.get("genre") !== "all") query.genre = params.get("genre");
      if (params.get("year") && params.get("year") !== "all") query.year = params.get("year");
      if (params.get("sort")) query.sort = params.get("sort");
      const r = await api.get("/movies", { params: query });
      setMovies(r.data);
      setLoading(false);
    })();
  }, [params]);

  const setParam = (key, value) => {
    const p = new URLSearchParams(params);
    if (!value || value === "all") p.delete(key);
    else p.set(key, value);
    setParams(p);
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setParam("q", q.trim());
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 60 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400 font-semibold">
        <SlidersHorizontal className="w-4 h-4" /> Explore the Catalog
      </div>
      <h1 className="mt-2 font-heading text-4xl font-bold text-white">Browse Movies</h1>

      <form onSubmit={submitSearch} className="mt-8 flex items-center gap-2 max-w-xl">
        <div className="flex-1 flex items-center gap-2 rounded-full pl-4 pr-2 py-2 bg-[#14181f] border border-white/10 focus-within:border-amber-500/60">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title, genre or actor..."
            className="border-0 bg-transparent focus-visible:ring-0 text-white placeholder:text-slate-500"
            data-testid="browse-search-input"
          />
        </div>
        <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-full h-10 px-5" data-testid="browse-search-btn">
          Search
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Select value={genre} onValueChange={(v) => setParam("genre", v)}>
          <SelectTrigger className="w-[180px] bg-[#14181f] border-white/10 text-white" data-testid="filter-genre">
            <SelectValue placeholder="Genre" />
          </SelectTrigger>
          <SelectContent className="bg-[#14181f] text-white border-white/10">
            <SelectItem value="all">All genres</SelectItem>
            {genres.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={(v) => setParam("year", v)}>
          <SelectTrigger className="w-[140px] bg-[#14181f] border-white/10 text-white" data-testid="filter-year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="bg-[#14181f] text-white border-white/10 max-h-72">
            <SelectItem value="all">All years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
          <SelectTrigger className="w-[180px] bg-[#14181f] border-white/10 text-white" data-testid="filter-sort">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent className="bg-[#14181f] text-white border-white/10">
            <SelectItem value="recent">Recently added</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="year">Release date</SelectItem>
          </SelectContent>
        </Select>

        {params.get("q") && (
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25" onClick={() => setParam("q", "")}>
            Query: {params.get("q")} ×
          </Badge>
        )}
      </div>

      <div className="mt-10">
        {loading ? (
          <div className="text-slate-500">Loading...</div>
        ) : movies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-20 text-center text-slate-500">
            No movies match your filters.
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
