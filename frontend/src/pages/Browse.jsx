import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import ActorCard from "@/components/ActorCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal } from "lucide-react";

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [actors, setActors] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") || "");
  const tab = params.get("tab") || "movies";
  const genre = params.get("genre") || "all";
  const year = params.get("year") || "all";
  const minRating = params.get("min_rating") || "any";
  const sort = params.get("sort") || "recent";

  useEffect(() => {
    api.get("/genres").then((r) => setGenres(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const qv = params.get("q") || "";
      const g = params.get("genre");
      const y = params.get("year");
      const mr = params.get("min_rating");
      const s = params.get("sort");
      const filters = {};
      if (qv) filters.q = qv;
      if (g && g !== "all") filters.genre = g;
      if (y && y !== "all") filters.year = y;
      if (mr && mr !== "any") filters.min_rating = mr;
      if (s) filters.sort = s;

      try {
        const [m, se] = await Promise.all([
          api.get("/movies", { params: filters }),
          api.get("/series", { params: filters }),
        ]);
        setMovies(m.data);
        setSeries(se.data);
      } catch {}

      if (qv) {
        try {
          const a = await api.get("/actors", { params: { q: qv } });
          setActors(a.data);
        } catch {}
      } else {
        try {
          const a = await api.get("/actors");
          setActors(a.data);
        } catch {}
      }
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
      <h1 className="mt-2 font-heading text-4xl font-bold text-white">Browse</h1>

      <form onSubmit={submitSearch} className="mt-8 flex items-center gap-2 max-w-xl">
        <div className="flex-1 flex items-center gap-2 rounded-full pl-4 pr-2 py-2 bg-[#14181f] border border-white/10 focus-within:border-amber-500/60">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies, series, actors, genres..."
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

        <Select value={minRating} onValueChange={(v) => setParam("min_rating", v === "any" ? "" : v)}>
          <SelectTrigger className="w-[160px] bg-[#14181f] border-white/10 text-white" data-testid="filter-min-rating">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent className="bg-[#14181f] text-white border-white/10">
            <SelectItem value="any">Any rating</SelectItem>
            <SelectItem value="5">5★ & up</SelectItem>
            <SelectItem value="6">6★ & up</SelectItem>
            <SelectItem value="7">7★ & up</SelectItem>
            <SelectItem value="8">8★ & up</SelectItem>
            <SelectItem value="9">9★ & up</SelectItem>
          </SelectContent>
        </Select>

        {(params.get("q") || params.get("genre") || params.get("year") || params.get("min_rating")) && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 border-white/15 text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              const p = new URLSearchParams(params);
              ["q", "genre", "year", "min_rating"].forEach((k) => p.delete(k));
              setParams(p);
              setQ("");
            }}
            data-testid="filter-clear-all"
          >
            Clear filters
          </Button>
        )}

        {params.get("q") && (
          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 cursor-pointer" onClick={() => setParam("q", "")}>
            Query: {params.get("q")} ×
          </Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)} className="mt-8">
        <TabsList className="bg-[#14181f] border border-white/10">
          <TabsTrigger value="movies" data-testid="browse-tab-movies">Movies ({movies.length})</TabsTrigger>
          <TabsTrigger value="series" data-testid="browse-tab-series">TV Series ({series.length})</TabsTrigger>
          <TabsTrigger value="actors" data-testid="browse-tab-actors">Actors ({actors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="movies" className="mt-6">
          {loading ? <SkeletonGrid /> : movies.length === 0 ? <Empty text="No movies match your filters." /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {movies.map((m) => <MovieCard key={m.id} movie={m} />)}
            </div>
          )}
        </TabsContent>
        <TabsContent value="series" className="mt-6">
          {loading ? <SkeletonGrid /> : series.length === 0 ? <Empty text="No TV series match your filters." /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {series.map((s) => <SeriesCard key={s.id} series={s} />)}
            </div>
          )}
        </TabsContent>
        <TabsContent value="actors" className="mt-6">
          {loading ? <SkeletonGrid /> : actors.length === 0 ? <Empty text="No actors found." /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {actors.map((a) => <ActorCard key={a.id} actor={a} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-20 text-center text-slate-500">
      {text}
    </div>
  );
}

function SkeletonGrid() {
  return <div className="text-slate-500">Loading...</div>;
}
