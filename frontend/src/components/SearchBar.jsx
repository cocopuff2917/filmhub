import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { Search, Film, Tv, User, X, Loader2 } from "lucide-react";

// Global typeahead: pings /api/search/suggest, shows grouped results.
// Keyboard: ArrowUp/Down navigates, Enter opens, Esc closes.
export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ movies: [], series: [], actors: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);
  const navigate = useNavigate();

  const flat = useMemo(() => {
    const rows = [];
    (results.movies || []).forEach((x) => rows.push({ ...x, kind: "movie" }));
    (results.series || []).forEach((x) => rows.push({ ...x, kind: "series" }));
    (results.actors || []).forEach((x) => rows.push({ ...x, kind: "actor" }));
    return rows;
  }, [results]);

  // Fetch suggestions (debounced 220ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults({ movies: [], series: [], actors: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      try {
        const r = await api.get("/search/suggest", { params: { q, limit: 6 } });
        if (myReq !== reqIdRef.current) return; // stale
        setResults(r.data || { movies: [], series: [], actors: [] });
        setActiveIndex(-1);
      } catch {
        if (myReq !== reqIdRef.current) return;
        setResults({ movies: [], series: [], actors: [] });
      }
      setLoading(false);
    }, 220);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Global "/" shortcut to focus search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const linkFor = (row) => {
    if (row.kind === "movie") return `/movie/${row.id}`;
    if (row.kind === "series") return `/series/${row.id}`;
    return `/actor/${row.id}`;
  };

  const openRow = (row) => {
    if (!row) return;
    setOpen(false);
    setQuery("");
    setResults({ movies: [], series: [], actors: [] });
    setActiveIndex(-1);
    navigate(linkFor(row));
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && flat[activeIndex]) {
        e.preventDefault();
        openRow(flat[activeIndex]);
      } else if (query.trim()) {
        e.preventDefault();
        setOpen(false);
        navigate(`/browse?q=${encodeURIComponent(query.trim())}`);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  const KindIcon = ({ kind }) => {
    const cls = "w-3.5 h-3.5";
    if (kind === "movie") return <Film className={cls} />;
    if (kind === "series") return <Tv className={cls} />;
    return <User className={cls} />;
  };

  let runningIdx = -1;
  const renderSection = (label, items, kind) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="py-1" data-testid={`search-section-${kind}`}>
        <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold flex items-center gap-1.5">
          <KindIcon kind={kind} /> {label}
        </div>
        {items.map((row) => {
          runningIdx += 1;
          const idx = runningIdx;
          const active = idx === activeIndex;
          return (
            <button
              key={`${kind}-${row.id}`}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openRow({ ...row, kind })}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${active ? "bg-amber-500/15" : "hover:bg-white/5"}`}
              data-testid={`search-result-${kind}-${row.id}`}
            >
              <div className={`flex-shrink-0 overflow-hidden bg-[#1e2430] border border-white/10 ${kind === "actor" ? "w-8 h-8 rounded-full" : "w-8 h-11 rounded"}`}>
                {row.poster_url ? (
                  <img src={fileUrl(row.poster_url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{row.title}</div>
                {row.year ? <div className="text-[11px] text-slate-500">{row.year}</div> : null}
              </div>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 hidden sm:inline">{kind}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative w-full max-w-md" data-testid="global-search-wrap">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search movies, TV, actors…"
          className="w-full bg-[#0d0f12] border border-white/10 focus:border-amber-500/60 focus:outline-none rounded-full pl-9 pr-9 py-2 text-sm text-white placeholder:text-slate-500 transition"
          data-testid="global-search-input"
          aria-label="Search movies, TV series and actors"
        />
        {loading ? (
          <Loader2 className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(""); setResults({ movies: [], series: [], actors: [] }); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            data-testid="global-search-clear"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <kbd className="hidden md:inline absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono border border-white/10 rounded px-1 py-0.5">/</kbd>
        )}
      </div>
      {showDropdown && (
        <div
          className="absolute z-50 mt-2 w-full sm:w-[420px] max-h-[75vh] overflow-y-auto rounded-xl border border-white/10 bg-[#14181f] shadow-2xl shadow-black/50 backdrop-blur"
          data-testid="global-search-dropdown"
        >
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="global-search-empty">
              {loading ? "Searching…" : `No results for "${query}"`}
            </div>
          ) : (
            <>
              {renderSection("Movies", results.movies, "movie")}
              {renderSection("TV Series", results.series, "series")}
              {renderSection("Actors", results.actors, "actor")}
              <div className="border-t border-white/5 px-3 py-2 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Press <kbd className="font-mono border border-white/10 rounded px-1">Enter</kbd> to browse all</span>
                <span className="hidden sm:inline">↑ ↓ to navigate</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
