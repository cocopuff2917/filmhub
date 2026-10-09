import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import MovieCard from "@/components/MovieCard";
import SeriesCard from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, Sparkles, Tv, X } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import { useAuth } from "@/context/AuthContext";

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
  const [upcomingEpisodes, setUpcomingEpisodes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [query, setQuery] = useState("");
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("home_announcement_dismissed") === "1"
  );
  const navigate = useNavigate();
  const { user } = useAuth();

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

  useEffect(() => {
    if (!user) {
      setRecommendations([]);
      return undefined;
    }
    let active = true;
    api.get("/recommendations")
      .then((response) => { if (active) setRecommendations(response.data || []); })
      .catch(() => { if (active) setRecommendations([]); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    let refreshTimer;
    const refreshUpcomingEpisodes = async () => {
      try {
        const response = await api.get("/series/upcoming-episodes");
        if (!active) return;
        const items = response.data || [];
        setUpcomingEpisodes(items);
        const now = Date.now();
        const nextRollover = items
          .map((series) => Date.parse(`${series.next_episode?.air_date}T00:00:00Z`) + 24 * 60 * 60 * 1000 + 1000)
          .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
          .sort((left, right) => left - right)[0];
        if (nextRollover) {
          refreshTimer = window.setTimeout(refreshUpcomingEpisodes, Math.min(nextRollover - now, 2147483647));
        }
      } catch {
        if (active) setUpcomingEpisodes([]);
      }
    };
    refreshUpcomingEpisodes();
    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
    };
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

  const hero = config?.hero || {};
  const announcement = config?.announcement || {};
  const featuredItems = hero.featured_items?.length
    ? hero.featured_items
    : hero.featured ? [hero.featured] : [];
  const featured = featuredItems[activeFeaturedIndex] || featuredItems[0];
  const featuredHref = featured ? getFeaturedHref(featured) : null;

  useEffect(() => {
    setActiveFeaturedIndex(0);
  }, [featuredItems.length]);

  useEffect(() => {
    if (featuredItems.length < 2 || heroPaused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setActiveFeaturedIndex((index) => (index + 1) % featuredItems.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [featuredItems.length, heroPaused]);

  const moveFeatured = (delta) => {
    setActiveFeaturedIndex((index) => (index + delta + featuredItems.length) % featuredItems.length);
  };

  if (!config) {
    return <div className="min-h-[60vh] grid place-items-center text-slate-500">Loading…</div>;
  }

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
      <section
        className="relative hero-radial overflow-hidden"
        data-testid="home-hero"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocusCapture={() => setHeroPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
        }}
      >
        {featuredItems.map((item, index) => {
          const image = item.backdrop_url || item.poster_url;
          if (!image) return null;
          return (
            <Link
              key={`${item.type}-${item.id}`}
              to={getFeaturedHref(item)}
              tabIndex={index === activeFeaturedIndex ? 0 : -1}
              aria-label={`View ${item.title}`}
              className={`absolute inset-0 z-0 transition-opacity duration-1000 ${index === activeFeaturedIndex ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              data-testid={`hero-featured-backdrop-link-${index}`}
            >
              <img
                src={fileUrl(image)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
                data-testid={index === activeFeaturedIndex ? "hero-featured-backdrop" : undefined}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === 0 ? "high" : "auto"}
              />
            </Link>
          );
        })}
        {featured && <div className="absolute inset-0 z-[1] bg-gradient-to-r from-black/90 via-black/70 to-black/20 pointer-events-none" />}
        <div className="noise-overlay pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" /> {hero.tagline || "CineVerse, curated for your next obsession"}
            </div>
            <h1 className="mt-6 font-display text-5xl sm:text-6xl lg:text-7xl leading-none tracking-tight text-white" data-testid="hero-title">
              {featured
                ? <Link to={featuredHref} className="transition-colors hover:text-amber-100">{featured.title}</Link>
                : (hero.title || "A new home for movie & TV lovers")}
            </h1>
            <p className="mt-6 text-slate-300 text-base sm:text-lg max-w-xl" data-testid="hero-subtitle">
              {featured ? (featured.overview || featured.description || hero.subtitle) : (hero.subtitle || "")}
            </p>
            {featured && (
              <div className="mt-6">
                <Link
                  to={featuredHref}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-black px-5 py-2.5 font-semibold text-sm"
                  data-testid="hero-featured-cta"
                >
                  View {featured.type === "series" ? "TV series" : "movie"}
                </Link>
              </div>
            )}
            {featuredItems.length > 1 && (
              <div className="mt-5 flex items-center gap-3" role="group" aria-label="Featured titles">
                <Button type="button" size="icon" variant="outline" onClick={() => moveFeatured(-1)} aria-label="Previous featured title" title="Previous featured title" className="h-9 w-9 border-white/25 bg-black/30 text-white hover:bg-white/10 hover:text-white" data-testid="hero-featured-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose featured title">
                  {featuredItems.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}-dot`}
                      type="button"
                      role="tab"
                      aria-selected={index === activeFeaturedIndex}
                      aria-label={`Show ${item.title}`}
                      onClick={() => setActiveFeaturedIndex(index)}
                      className={`h-2.5 rounded-full transition-all ${index === activeFeaturedIndex ? "w-7 bg-amber-400" : "w-2.5 bg-white/50 hover:bg-white/80"}`}
                      data-testid={`hero-featured-dot-${index}`}
                    />
                  ))}
                </div>
                <Button type="button" size="icon" variant="outline" onClick={() => moveFeatured(1)} aria-label="Next featured title" title="Next featured title" className="h-9 w-9 border-white/25 bg-black/30 text-white hover:bg-white/10 hover:text-white" data-testid="hero-featured-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
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
        const kind = SOURCE_ENDPOINTS[s.source]?.kind || "movie";
        return <SectionBlock key={s.id} title={s.title} items={items} testid={`section-${s.id}`} forceKind={kind} />;
      })}

      <SectionBlock title="Upcoming TV Episodes" items={upcomingEpisodes} testid="section-upcoming-episodes" forceKind="series" />
      {user && recommendations.length > 0 && <SectionBlock title="Picked for You" items={recommendations} testid="section-recommendations" showRecommendationReason />}

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

function getFeaturedHref(item) {
  return item.type === "series" ? `/series/${item.id}` : `/movie/${item.id}`;
}

function SectionBlock({ title, items, testid, forceKind, showRecommendationReason = false }) {
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
        {items.map((it) => {
          const kind = forceKind || (it.type === "series" || it.type === "movie" ? it.type : "movie");
          return (
            <div key={`${kind}-${it.id}`}>
              {kind === "series" ? <SeriesCard series={it} /> : <MovieCard movie={it} />}
              {showRecommendationReason && <p className="mt-2 text-xs text-slate-400">{it.recommendation_reason}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
