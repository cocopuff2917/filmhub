import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

const metadataCache = { genres: null, networks: null };
const tabResultsCache = {};

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [actors, setActors] = useState([]);
  const [genres, setGenres] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [loadedTabs, setLoadedTabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") || "");
  const tabResultsRef = useRef(tabResultsCache);
  const tab = params.get("tab") || "movies";
  const genre = params.get("genre") || "all";
  const network = params.get("network") || "all";
  const year = params.get("year") || "all";
  const minRating = params.get("min_rating") || "any";
  const sort = params.get("sort") || "recent";

  useEffect(() => {
    let active = true;

    const loadMetadata = async () => {
      try {
        if (metadataCache.genres && metadataCache.networks) {
          if (active) {
            setGenres(metadataCache.genres);
            setNetworks(metadataCache.networks);
          }
          return;
        }

        const [genresRes, networksRes] = await Promise.all([
          metadataCache.genres ? Promise.resolve({ data: metadataCache.genres }) : api.get("/genres"),
          metadataCache.networks ? Promise.resolve({ data: metadataCache.networks }) : api.get("/series/networks"),
        ]);

        metadataCache.genres = genresRes.data;
        metadataCache.networks = networksRes.data;

        if (active) {
          setGenres(genresRes.data);
          setNetworks(networksRes.data);
        }
      } catch (error) {
        // Ignore metadata failures; the page still works with the currently cached values.
      }
    };

    loadMetadata();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const qv = params.get("q") || "";
      const g = params.get("genre");
      const n = params.get("network");
      const y = params.get("year");
      const mr = params.get("min_rating");
      const s = params.get("sort");
      const filters = {};
      if (qv) filters.q = qv;
      if (g && g !== "all") filters.genre = g;
      if (tab === "series" && n && n !== "all") filters.network = n;
      if (y && y !== "all") filters.year = y;
      if (mr && mr !== "any") filters.min_rating = mr;
      if (s) filters.sort = s;

      const cacheKey = `${tab}:${JSON.stringify(filters)}`;
      const cached = tabResultsRef.current[cacheKey];

      if (cached) {
        if (tab === "series") setSeries(cached);
        else if (tab === "actors") setActors(cached);
        else setMovies(cached);
        setLoadedTabs((loaded) => ({ ...loaded, [tab]: true }));
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const options = { params: filters, signal: controller.signal };
        let response;
        if (tab === "series") {
          response = await api.get("/series", options);
          setSeries(response.data);
          tabResultsRef.current[cacheKey] = response.data;
        } else if (tab === "actors") {
          response = await api.get("/actors", {
            params: qv ? { q: qv } : {},
            signal: controller.signal,
          });
          setActors(response.data);
          tabResultsRef.current[cacheKey] = response.data;
        } else {
          response = await api.get("/movies", options);
          setMovies(response.data);
          tabResultsRef.current[cacheKey] = response.data;
        }

        setLoadedTabs((loaded) => ({ ...loaded, [tab]: true }));
      } catch (error) {
        if (!controller.signal.aborted) {
          if (tab === "series") setSeries([]);
          else if (tab === "actors") setActors([]);
          else setMovies([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params, tab]);

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
    <div className="min-h-screen bg-[#0d0f12] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_25%),linear-gradient(120deg,#0d0f12_0%,#10151d_45%,#0d0f12_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-amber-300 font-semibold">
            <SlidersHorizontal className="w-4 h-4" /> Explore the catalog
          </div>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">Browse</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">Discover the latest movies, iconic TV series, and performers across the CineVerse archive.</p>
            </div>
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200">
              Curated picks
            </div>
          </div>

          <form onSubmit={submitSearch} className="mt-8 max-w-2xl">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#10151d]/90 pl-4 pr-2 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] focus-within:border-amber-500/60 focus-within:ring-1 focus-within:ring-amber-500/40">
              <Search className="w-4 h-4 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search movies, series, actors, genres..."
                className="border-0 bg-transparent focus-visible:ring-0 text-white placeholder:text-slate-500"
                data-testid="browse-search-input"
              />
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-full h-10 px-5" data-testid="browse-search-btn">
                Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mt-2 flex flex-wrap items-center gap-3">
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

        {tab === "series" && (
          <>
            <Select value={network} onValueChange={(v) => setParam("network", v)}>
              <SelectTrigger className="w-[180px] bg-[#14181f] border-white/10 text-white" data-testid="filter-network">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent className="bg-[#14181f] text-white border-white/10">
                <SelectItem value="all">All networks</SelectItem>
                {networks.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            {network !== "all" && (
              <Link to={`/network/${encodeURIComponent(network)}`} className="text-sm font-medium text-amber-400 hover:text-amber-300" data-testid="open-network-page">
                View {network} series
              </Link>
            )}
          </>
        )}

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

        {(params.get("q") || params.get("genre") || params.get("network") || params.get("year") || params.get("min_rating")) && (
          <Button
            size="sm"
            variant="outline"
            className="h-10 border-white/15 text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              const p = new URLSearchParams(params);
              ["q", "genre", "network", "year", "min_rating"].forEach((k) => p.delete(k));
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
        <TabsList className="bg-[#14181f]/80 border border-white/10 p-1 rounded-2xl">
          <TabsTrigger value="movies" className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-200 data-[state=active]:shadow-none text-slate-300" data-testid="browse-tab-movies">Movies{loadedTabs.movies ? ` (${movies.length})` : ""}</TabsTrigger>
          <TabsTrigger value="series" className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-200 data-[state=active]:shadow-none text-slate-300" data-testid="browse-tab-series">TV Series{loadedTabs.series ? ` (${series.length})` : ""}</TabsTrigger>
          <TabsTrigger value="actors" className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-200 data-[state=active]:shadow-none text-slate-300" data-testid="browse-tab-actors">Actors{loadedTabs.actors ? ` (${actors.length})` : ""}</TabsTrigger>
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
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-[#14181f]/60 py-20 text-center text-slate-400 shadow-[0_18px_40px_rgba(0,0,0,0.15)]">
      {text}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-[#14181f]/80 p-2">
          <div className="aspect-[2/3] rounded-xl bg-[#1d2430]" />
          <div className="mt-3 h-4 rounded bg-[#1d2430]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-[#1d2430]" />
        </div>
      ))}
    </div>
  );
}
