import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, TrendingUp, Clock, Tv, Rocket } from "lucide-react";

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [recent, setRecent] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [trendingSeries, setTrendingSeries] = useState([]);
  const [recentSeries, setRecentSeries] = useState([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [t, r, u, ts, rs] = await Promise.all([
          api.get("/movies/trending"),
          api.get("/movies/recent"),
          api.get("/movies/upcoming"),
          api.get("/series/trending"),
          api.get("/series/recent"),
        ]);
        setTrending(t.data);
        setRecent(r.data);
        setUpcoming(u.data);
        setTrendingSeries(ts.data);
        setRecentSeries(rs.data);
      } catch (e) {}
    })();
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/browse?q=${encodeURIComponent(q)}`);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative hero-radial overflow-hidden">
        <div className="noise-overlay" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" /> The Movie Database, Reimagined
            </div>
            <h1 className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl leading-none tracking-tight text-white">
              Every film.<br />
              <span className="text-amber-400">Every story.</span> Cataloged.
            </h1>
            <p className="mt-6 text-slate-300 text-base sm:text-lg max-w-xl">
              Browse thousands of movies, discover actor profiles, rate what you've seen, and
              build your personal watchlist — all in one cinematic vault.
            </p>

            <form onSubmit={submitSearch} className="mt-10 relative max-w-2xl">
              <div className="flex items-center gap-2 glass rounded-full pl-5 pr-2 py-2 border border-white/10 focus-within:border-amber-500/60 transition">
                <Search className="w-5 h-5 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search movies, genres, or actors..."
                  className="border-0 bg-transparent focus-visible:ring-0 text-white placeholder:text-slate-500 text-base h-11"
                  data-testid="hero-search-input"
                />
                <Button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-full px-5 h-10"
                  data-testid="hero-search-btn"
                >
                  Search
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Trending */}
      <Section
        icon={<TrendingUp className="w-5 h-5 text-amber-400" />}
        title="Trending Movies"
        subtitle="Curated by the CineVerse team"
        items={trending}
        renderCard={(m) => <MovieCard key={m.id} movie={m} />}
        emptyText="No trending movies yet. Mark movies as trending to feature them."
        testid="trending-section"
      />

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section
          icon={<Rocket className="w-5 h-5 text-amber-400" />}
          title="Upcoming Releases"
          subtitle="Coming soon to theaters"
          items={upcoming}
          renderCard={(m) => (
            <div key={m.id} className="relative">
              <MovieCard movie={m} />
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500 text-black px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {m.release_date}
              </div>
            </div>
          )}
          emptyText=""
          testid="upcoming-section"
        />
      )}

      {/* Trending Series */}
      <Section
        icon={<Tv className="w-5 h-5 text-amber-400" />}
        title="Trending TV Series"
        subtitle="Binge-worthy right now"
        items={trendingSeries}
        renderCard={(s) => <SeriesCard key={s.id} series={s} />}
        emptyText="No TV series yet. Add one from the admin panel."
        testid="trending-series-section"
      />

      {/* Recently Added Movies */}
      <Section
        icon={<Clock className="w-5 h-5 text-amber-400" />}
        title="Recently Added"
        subtitle="Freshly cataloged in the database"
        items={recent}
        renderCard={(m) => <MovieCard key={m.id} movie={m} />}
        emptyText="No movies yet. Login as admin to add the first one."
        testid="recent-section"
      />

      {/* Recently Added Series */}
      {recentSeries.length > 0 && (
        <Section
          icon={<Tv className="w-5 h-5 text-amber-400" />}
          title="New Series"
          subtitle="Fresh episodes to explore"
          items={recentSeries}
          renderCard={(s) => <SeriesCard key={s.id} series={s} />}
          emptyText=""
          testid="recent-series-section"
        />
      )}

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="stripe-divider mb-10" />
        <div className="font-display text-3xl text-white tracking-widest">CINE<span className="text-amber-400">VERSE</span></div>
        <p className="mt-3 text-sm text-slate-500">Built for cinephiles. Every entry is a story.</p>
      </footer>
    </div>
  );
}

function Section({ icon, title, subtitle, items, renderCard, emptyText, testid }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid={testid}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/90">
            {icon} <span>{subtitle}</span>
          </div>
          <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">{title}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#14181f]/50 py-16 text-center text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          {items.map((it) => renderCard(it))}
        </div>
      )}
    </section>
  );
}
