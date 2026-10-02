import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, Tv, X } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";

const SOURCE_ENDPOINTS = {
  trending_movies: { url: "/movies/trending", kind: "movie" },
  upcoming_movies: { url: "/movies/upcoming", kind: "movie" },
  trending_series: { url: "/series/trending", kind: "series" },
  recent_movies: { url: "/movies/recent", kind: "movie" },
  recent_series: { url: "/series/recent", kind: "series" },
};

export default function Home() {
  const [config, setConfig] = useState(null);
  const [sectionData, setSectionData] = useState({});
  const [query, setQuery] = useState("");
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("home_announcement_dismissed") === "1"
  );
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/homepage/config");
        setConfig(r.data);
        // Fetch built-in section data in parallel
        const builtins = (r.data.sections || []).filter((s) => s.enabled && s.type === "built-in" && SOURCE_ENDPOINTS[s.source]);
        const results = await Promise.all(
          builtins.map((s) => api.get(SOURCE_ENDPOINTS[s.source].url).catch(() => ({ data: [] })))
        );
        const map = {};
        builtins.forEach((s, i) => { map[s.id] = results[i].data || []; });
        setSectionData(map);
      } catch (e) {}
    })();
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/browse?q=${encodeURIComponent(q)}`);
  };

  const dismissAnnouncement = () => {
    setDismissedAnnouncement(true);
    try { sessionStorage.setItem("home_announcement_dismissed", "1"); } catch {}
  };

  if (!config) {
    return <div className="min-h-[60vh] grid place-items-center text-slate-500">Loading…</div>;
  }

  const hero = config.hero || {};
  const announcement = config.announcement || {};
  const featured = hero.featured;

  return (
    <div>
      {/* Announcement banner */}
      {announcement.enabled && announcement.text && !dismissedAnnouncement && (
        <div className="bg-amber-500 text-black" data-testid="home-announcement">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3 text-sm font-medium">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{announcement.text}</span>
            {announcement.link_url && (
              <a
                href={announcement.link_url}
                className="ml-auto underline font-semibold hover:opacity-80 whitespace-nowrap"
                data-testid="announcement-link"
              >
                {announcement.link_label || "Learn more"}
              </a>
            )}
            <button
              onClick={dismissAnnouncement}
              className="ml-2 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              data-testid="announcement-dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative hero-radial overflow-hidden" data-testid="home-hero">
        {featured?.backdrop_url && (
          <>
            <img
              src={fileUrl(featured.backdrop_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30"
              data-testid="hero-featured-backdrop"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />
          </>
        )}
        <div className="noise-overlay" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" /> {hero.tagline || "The Movie Database, Reimagined"}
            </div>
            <h1 className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl leading-none tracking-tight text-white" data-testid="hero-title">
              {featured ? featured.title : (hero.title || "A new home for movie & TV lovers")}
            </h1>
            <p className="mt-6 text-slate-300 text-base sm:text-lg max-w-xl" data-testid="hero-subtitle">
              {featured ? (featured.overview || featured.description || hero.subtitle) : (hero.subtitle || "")}
            </p>
            {featured && (
              <div className="mt-6">
                <Link
                  to={featured.type === "series" ? `/series/${featured.id}` : `/movies/${featured.id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black px-5 py-2.5 font-semibold text-sm"
                  data-testid="hero-featured-cta"
                >
                  Watch now
                </Link>
              </div>
            )}
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

      {/* Dynamic sections */}
      {(config.sections || []).filter((s) => s.enabled).map((s) => {
        if (s.type === "custom") {
          const items = (s.resolved_items || []).slice(0, s.limit || 12);
          return <SectionBlock key={s.id} title={s.title} items={items} testid={`section-${s.id}`} />;
        }
        const items = (sectionData[s.id] || []).slice(0, s.limit || 12);
        return <SectionBlock key={s.id} title={s.title} items={items} testid={`section-${s.id}`} />;
      })}

      {/* Weekly leaderboard — always after the first section cluster */}
      <Leaderboard />

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="stripe-divider mb-10" />
        <div className="font-display text-3xl text-white tracking-widest">CINE<span className="text-amber-400">VERSE</span></div>
        <p className="mt-3 text-sm text-slate-500">Built for cinephiles. Every entry is a story.</p>
      </footer>
    </div>
  );
}

function SectionBlock({ title, items, testid }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14" data-testid={testid}>
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/90">
            <Tv className="w-4 h-4" /> <span>Curated</span>
          </div>
          <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold text-white">{title}</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
        {items.map((it) =>
          it.type === "series"
            ? <SeriesCard key={`s-${it.id}`} series={it} />
            : <MovieCard key={`m-${it.id}`} movie={it} />
        )}
      </div>
    </section>
  );
}
